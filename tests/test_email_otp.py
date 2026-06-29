"""
email_otp 單元測試（in-memory SQLite + mock SMTP，§1.1 #3）。
"""
import datetime
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from unittest.mock import MagicMock, patch

from app.models import AdminLoginOtp, Department, Role, User
from app.services import email_otp as otp_module
from app.services.email_otp import (
    OtpEligibilityError,
    OtpRateLimitError,
    OtpVerifyError,
    can_use_email_fallback,
    mark_ad_reachable,
    mark_ad_unreachable,
    request_otp,
    verify_otp,
)


def _settings(
    ad_enabled=True,
    ad_fallback_email_enabled=True,
    ad_email_fallback_max_days=30,
    ad_email_otp_length=6,
    ad_email_otp_ttl_minutes=10,
    ad_email_otp_max_requests=3,
    ad_email_allowed_domain="",
    smtp_host="smtp.test.local",
    smtp_user="user",
    smtp_password="pass",
    smtp_from="noreply@test.local",
    smtp_port=587,
    smtp_use_tls=True,
):
    s = MagicMock()
    s.ad_enabled = ad_enabled
    s.ad_fallback_email_enabled = ad_fallback_email_enabled
    s.ad_email_fallback_max_days = ad_email_fallback_max_days
    s.ad_email_otp_length = ad_email_otp_length
    s.ad_email_otp_ttl_minutes = ad_email_otp_ttl_minutes
    s.ad_email_otp_max_requests = ad_email_otp_max_requests
    s.ad_email_allowed_domain = ad_email_allowed_domain
    s.smtp_host = smtp_host
    s.smtp_user = smtp_user
    s.smtp_password = smtp_password
    s.smtp_from = smtp_from
    s.smtp_port = smtp_port
    s.smtp_use_tls = smtp_use_tls
    s.smtp_configured = bool(smtp_host and smtp_user and smtp_password)
    return s


def _admin_user(
    db,
    emp_id="jdoe",
    email="jdoe@test.local",
    is_trainee=False,
    status="active",
    email_verified_at_days_ago=5,
):
    dept = db.query(Department).filter(Department.name == "IT部").first()
    role = db.query(Role).filter(Role.name == "系統管理").first()
    ev_at = (
        datetime.datetime.utcnow() - datetime.timedelta(days=email_verified_at_days_ago)
        if email_verified_at_days_ago is not None
        else None
    )
    user = User(
        emp_id=emp_id,
        name="John Doe",
        dept_id=dept.id,
        role_id=role.id,
        status=status,
        is_trainee=is_trainee,
        email=email,
        email_verified_at=ev_at,
        auth_source="ad",
    )
    db.add(user)
    db.commit()
    return user


# ── can_use_email_fallback ───────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_ad_state():
    """每個測試前後重設 AD 不可達快取。"""
    mark_ad_reachable()
    yield
    mark_ad_reachable()


def test_fallback_disabled_in_settings(in_memory_db):
    s = _settings(ad_fallback_email_enabled=False)
    user = _admin_user(in_memory_db)
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "停用" in reason


def test_fallback_ad_reachable(in_memory_db):
    """AD 可達時不應允許路徑 D。"""
    s = _settings()
    user = _admin_user(in_memory_db)
    mark_ad_reachable()  # 明確可達
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "AD 目前可達" in reason


def test_fallback_trainee_not_eligible(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db, is_trainee=True)
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "非管理帳號" in reason


def test_fallback_no_email(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db, email=None)
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "Email" in reason


def test_fallback_domain_not_in_whitelist(in_memory_db):
    s = _settings(ad_email_allowed_domain="allowed.com")
    user = _admin_user(in_memory_db, email="jdoe@other.com")
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "白名單" in reason


def test_fallback_inactive_user(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db, status="inactive")
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "停用" in reason


def test_fallback_never_logged_in_ad(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db, email_verified_at_days_ago=None)
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "AD 登入" in reason


def test_fallback_ad_login_too_old(in_memory_db):
    s = _settings(ad_email_fallback_max_days=30)
    user = _admin_user(in_memory_db, email_verified_at_days_ago=31)
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is False
    assert "超過" in reason


def test_fallback_eligible(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db, email_verified_at_days_ago=5)
    mark_ad_unreachable()
    ok, reason = can_use_email_fallback(user, s)
    assert ok is True
    assert reason == ""


def test_ad_enabled_false_always_reachable():
    """AD_ENABLED=false 時 is_ad_unreachable() 固定回 False（§1.1 #4）。"""
    s = _settings(ad_enabled=False)
    mark_ad_unreachable(duration_seconds=3600)
    assert otp_module.is_ad_unreachable(settings=s) is False


# ── request_otp ──────────────────────────────────────────────────


def test_request_otp_rate_limit(in_memory_db):
    s = _settings(ad_email_otp_max_requests=2)
    user = _admin_user(in_memory_db)
    mark_ad_unreachable()

    # 塞入 2 筆近期 OTP 紀錄
    for _ in range(2):
        row = AdminLoginOtp(
            emp_id="jdoe",
            otp_hash="x",
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=10),
        )
        in_memory_db.add(row)
    in_memory_db.commit()

    with pytest.raises(OtpRateLimitError):
        request_otp(in_memory_db, "jdoe", "127.0.0.1", settings=s)


def test_request_otp_user_not_found(in_memory_db):
    s = _settings()
    mark_ad_unreachable()
    with pytest.raises(OtpEligibilityError):
        request_otp(in_memory_db, "nobody", "127.0.0.1", settings=s)


def test_request_otp_success(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db)
    mark_ad_unreachable()

    with patch("app.services.smtp_mailer.send_otp_email") as mock_send:
        result = request_otp(in_memory_db, "jdoe", "127.0.0.1", settings=s)

    assert "masked_email" in result
    assert result["masked_email"].startswith("j***@")
    assert result["expires_in_seconds"] == 600
    mock_send.assert_called_once()


# ── verify_otp ───────────────────────────────────────────────────


def _insert_otp(db, emp_id="jdoe", otp_code="123456", minutes_until_expire=10):
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
    row = AdminLoginOtp(
        emp_id=emp_id,
        otp_hash=ctx.hash(otp_code),
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes_until_expire),
    )
    db.add(row)
    db.commit()
    return row


def test_verify_otp_success(in_memory_db):
    s = _settings()
    user = _admin_user(in_memory_db)
    _insert_otp(in_memory_db, otp_code="123456")

    result = verify_otp(in_memory_db, "jdoe", "123456", "127.0.0.1", settings=s)

    assert result.emp_id == "jdoe"
    assert result.auth_source == "email_fallback"
    assert result.last_login_at is not None


def test_verify_otp_wrong_code(in_memory_db):
    s = _settings()
    _admin_user(in_memory_db)
    _insert_otp(in_memory_db, otp_code="123456")

    with pytest.raises(OtpVerifyError):
        verify_otp(in_memory_db, "jdoe", "000000", "127.0.0.1", settings=s)


def test_verify_otp_expired(in_memory_db):
    s = _settings()
    _admin_user(in_memory_db)
    _insert_otp(in_memory_db, otp_code="123456", minutes_until_expire=-1)

    with pytest.raises(OtpVerifyError, match="過期"):
        verify_otp(in_memory_db, "jdoe", "123456", "127.0.0.1", settings=s)


def test_verify_otp_invalidated_after_max_attempts(in_memory_db):
    """連續失敗 6 次後，即使驗證碼正確也已作廢。"""
    s = _settings()
    _admin_user(in_memory_db)
    row = _insert_otp(in_memory_db, otp_code="123456")
    # 模擬已失敗 5 次
    row.attempt_count = 5
    in_memory_db.commit()

    # 第 6 次輸入錯誤 → 作廢
    with pytest.raises(OtpVerifyError):
        verify_otp(in_memory_db, "jdoe", "000000", "127.0.0.1", settings=s)

    # 再試正確碼 → 已作廢，找不到有效 OTP
    with pytest.raises(OtpVerifyError):
        verify_otp(in_memory_db, "jdoe", "123456", "127.0.0.1", settings=s)


def test_verify_otp_no_otp_row(in_memory_db):
    s = _settings()
    _admin_user(in_memory_db)

    with pytest.raises(OtpVerifyError, match="不存在或已過期"):
        verify_otp(in_memory_db, "jdoe", "123456", "127.0.0.1", settings=s)
