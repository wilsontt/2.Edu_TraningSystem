"""
password_policy 單元測試（不需要 DB）。
"""
import datetime
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from unittest.mock import MagicMock

from app.services.password_policy import (
    PasswordPolicyViolation,
    is_password_expired,
    validate_password_complexity,
)


def _settings(min_length=12, max_age_days=90):
    s = MagicMock()
    s.password_min_length = min_length
    s.password_max_age_days = max_age_days
    return s


def _user(password_changed_at=None):
    u = MagicMock()
    u.password_changed_at = password_changed_at
    return u


# ── validate_password_complexity ────────────────────────────────


def test_password_too_short():
    with pytest.raises(PasswordPolicyViolation, match="至少需要"):
        validate_password_complexity("Short1!", _settings(min_length=12))


def test_password_missing_uppercase():
    with pytest.raises(PasswordPolicyViolation, match="大寫"):
        validate_password_complexity("lowercase1!aaa", _settings())


def test_password_missing_lowercase():
    with pytest.raises(PasswordPolicyViolation, match="小寫"):
        validate_password_complexity("UPPERCASE1!AAA", _settings())


def test_password_missing_digit():
    with pytest.raises(PasswordPolicyViolation, match="數字"):
        validate_password_complexity("NoDIGIThere!", _settings())


def test_password_missing_special():
    with pytest.raises(PasswordPolicyViolation, match="特殊字元"):
        validate_password_complexity("NoSpecial1aaa", _settings())


def test_password_exactly_min_length_passes():
    # 12 chars, all requirements met
    validate_password_complexity("Abcde12345!a", _settings(min_length=12))


def test_password_long_and_complex():
    validate_password_complexity("SecureP@ssw0rd2026!!", _settings())


# ── is_password_expired ──────────────────────────────────────────


def test_never_changed_is_expired():
    """password_changed_at 為 None → 視為已到期。"""
    assert is_password_expired(_user(None), _settings()) is True


def test_old_password_is_expired():
    old = datetime.datetime.utcnow() - datetime.timedelta(days=91)
    assert is_password_expired(_user(old), _settings(max_age_days=90)) is True


def test_fresh_password_not_expired():
    fresh = datetime.datetime.utcnow() - datetime.timedelta(days=30)
    assert is_password_expired(_user(fresh), _settings(max_age_days=90)) is False


def test_exactly_at_boundary_is_expired():
    """等於 max_age_days 視為已到期（>= 比較）。"""
    at_limit = datetime.datetime.utcnow() - datetime.timedelta(days=90)
    assert is_password_expired(_user(at_limit), _settings(max_age_days=90)) is True


def test_one_day_before_expiry_not_expired():
    recent = datetime.datetime.utcnow() - datetime.timedelta(days=89)
    assert is_password_expired(_user(recent), _settings(max_age_days=90)) is False
