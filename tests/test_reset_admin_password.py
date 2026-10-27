"""
reset_admin_password 腳本單元測試（in-memory／暫存 SQLite，不連 data/education_training.db）。
"""
import importlib
import logging
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend", "scripts"))

from app import models  # noqa: E402
from app.auth_utils import verify_password  # noqa: E402

script = importlib.import_module("reset_admin_password")

VALID_PASSWORD = "NewPassw0rd!2026"
NOW = datetime(2026, 10, 27, 8, 0, 0)


def _settings(min_length=12, emp_id="admin"):
    s = MagicMock()
    s.password_min_length = min_length
    s.break_glass_emp_id = emp_id
    return s


def _make_admin(db, protected=True, status="active", locked=True):
    user = models.User(
        emp_id="admin",
        name="系統管理員",
        status=status,
        auth_source="local",
        is_protected=protected,
        password_hash="old-hash",
        must_change_password=True,
        failed_login_count=5,
        locked_until=(NOW + timedelta(minutes=10)) if locked else None,
    )
    db.add(user)
    db.commit()
    return user


def test_success_updates_all_fields(in_memory_db):
    _make_admin(in_memory_db)
    result = script.reset_admin_password(
        in_memory_db, VALID_PASSWORD, _settings(), "tester", now=NOW
    )
    user = in_memory_db.query(models.User).filter_by(emp_id="admin").one()
    assert verify_password(VALID_PASSWORD, user.password_hash)
    assert user.password_changed_at == NOW
    assert user.must_change_password is False
    assert user.failed_login_count == 0
    assert user.locked_until is None
    assert result.emp_id == "admin"
    assert result.was_locked is True
    assert result.is_inactive is False


def test_inactive_account_is_reported(in_memory_db):
    _make_admin(in_memory_db, status="inactive")
    result = script.reset_admin_password(
        in_memory_db, VALID_PASSWORD, _settings(), "tester", now=NOW
    )
    assert result.is_inactive is True


@pytest.mark.parametrize(
    "bad",
    ["short1!A", "alllowercase1234!", "ALLUPPERCASE1234!", "NoDigitsHere!!!!", "NoSpecial12345A"],
)
def test_weak_password_rejected_and_hash_unchanged(in_memory_db, bad):
    _make_admin(in_memory_db)
    with pytest.raises(script.UsageError):
        script.reset_admin_password(in_memory_db, bad, _settings(), "tester", now=NOW)
    user = in_memory_db.query(models.User).filter_by(emp_id="admin").one()
    assert user.password_hash == "old-hash"
    assert user.failed_login_count == 5


def test_password_over_72_bytes_rejected(in_memory_db):
    _make_admin(in_memory_db)
    too_long = "Aa1!" + "x" * 80
    with pytest.raises(script.UsageError, match="72"):
        script.reset_admin_password(in_memory_db, too_long, _settings(), "tester", now=NOW)


def test_admin_not_found(in_memory_db):
    with pytest.raises(script.UsageError, match="找不到"):
        script.reset_admin_password(
            in_memory_db, VALID_PASSWORD, _settings(), "tester", now=NOW
        )


def test_non_protected_account_rejected(in_memory_db):
    _make_admin(in_memory_db, protected=False)
    with pytest.raises(script.UsageError, match="break-glass"):
        script.reset_admin_password(
            in_memory_db, VALID_PASSWORD, _settings(), "tester", now=NOW
        )
    user = in_memory_db.query(models.User).filter_by(emp_id="admin").one()
    assert user.password_hash == "old-hash"


def test_audit_log_has_os_user_and_no_password(in_memory_db, caplog):
    _make_admin(in_memory_db)
    with caplog.at_level(logging.INFO, logger="audit"):
        script.reset_admin_password(
            in_memory_db, VALID_PASSWORD, _settings(), "alice", now=NOW
        )
    text = caplog.text
    assert "event=admin_password_reset" in text
    assert "os_user=alice" in text
    assert VALID_PASSWORD not in text


def test_obtain_password_from_env(monkeypatch):
    monkeypatch.setenv("NEW_ADMIN_PASSWORD", VALID_PASSWORD)
    assert script.obtain_new_password() == VALID_PASSWORD


def test_obtain_password_non_tty_without_env(monkeypatch):
    monkeypatch.delenv("NEW_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False)
    with pytest.raises(script.UsageError, match="非互動"):
        script.obtain_new_password()


def test_obtain_password_mismatch(monkeypatch):
    monkeypatch.delenv("NEW_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    answers = iter(["aaaa", "bbbb"])
    monkeypatch.setattr(script.getpass, "getpass", lambda prompt="": next(answers))
    with pytest.raises(script.UsageError, match="不一致"):
        script.obtain_new_password()


def test_obtain_password_interactive_ok(monkeypatch):
    monkeypatch.delenv("NEW_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr(script.getpass, "getpass", lambda prompt="": VALID_PASSWORD)
    assert script.obtain_new_password() == VALID_PASSWORD


def _patch_main(monkeypatch, in_memory_db, settings):
    monkeypatch.setattr(script, "_configure_audit_logging", lambda: None)
    monkeypatch.setattr(script, "SessionLocal", sessionmaker(bind=in_memory_db.get_bind()))
    monkeypatch.setattr(script, "get_settings", lambda: settings)


def test_main_exit_codes_and_no_plaintext(monkeypatch, in_memory_db, capsys):
    _make_admin(in_memory_db)
    _patch_main(monkeypatch, in_memory_db, _settings())

    monkeypatch.setenv("NEW_ADMIN_PASSWORD", "weak")
    assert script.main() == script.EXIT_USAGE
    assert "Admin 密碼未變更" in capsys.readouterr().err

    monkeypatch.setenv("NEW_ADMIN_PASSWORD", VALID_PASSWORD)
    assert script.main() == script.EXIT_OK
    captured = capsys.readouterr()
    assert VALID_PASSWORD not in captured.out + captured.err
    in_memory_db.expire_all()
    user = in_memory_db.query(models.User).filter_by(emp_id="admin").one()
    assert verify_password(VALID_PASSWORD, user.password_hash)


def test_main_unexpected_error_exit_2(monkeypatch, in_memory_db, capsys):
    _patch_main(monkeypatch, in_memory_db, _settings())
    monkeypatch.setenv("NEW_ADMIN_PASSWORD", VALID_PASSWORD)

    def boom(*args, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(script, "reset_admin_password", boom)
    assert script.main() == script.EXIT_ERROR
    assert VALID_PASSWORD not in capsys.readouterr().err
