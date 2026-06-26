"""
jit_provision 單元測試（in-memory SQLite，§1.1 #3）。
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from unittest.mock import MagicMock

from app.models import Department, Role, User
from app.services.ad_auth import AdAuthResult
from app.services.jit_provision import EmpIdCollisionError, upsert_admin_user


def _settings(
    ad_admin_role_name="系統管理",
    ad_default_dept_name="IT部",
):
    s = MagicMock()
    s.ad_admin_role_name = ad_admin_role_name
    s.ad_default_dept_name = ad_default_dept_name
    return s


def _ad_result(username="jdoe", display_name="John Doe", mail="jdoe@test.local"):
    return AdAuthResult(
        ad_username=username,
        display_name=display_name,
        groups=["IT_Admin"],
        mail=mail,
    )


# ── 新帳號 JIT 建立 ──────────────────────────────────────────────


def test_upsert_creates_new_admin_user(in_memory_db):
    s = _settings()
    result = upsert_admin_user(in_memory_db, _ad_result(), s)

    assert result.emp_id == "jdoe"
    assert result.name == "John Doe"
    assert result.email == "jdoe@test.local"
    assert result.is_trainee is False
    assert result.auth_source == "ad"
    assert result.email_verified_at is not None
    assert result.last_login_at is not None


def test_upsert_creates_correct_role(in_memory_db):
    s = _settings()
    result = upsert_admin_user(in_memory_db, _ad_result(), s)

    role = in_memory_db.query(Role).filter(Role.id == result.role_id).first()
    assert role.name == "系統管理"


def test_upsert_creates_correct_dept(in_memory_db):
    s = _settings()
    result = upsert_admin_user(in_memory_db, _ad_result(), s)

    dept = in_memory_db.query(Department).filter(Department.id == result.dept_id).first()
    assert dept.name == "IT部"


# ── 既有管理帳號更新 ────────────────────────────────────────────


def test_upsert_updates_existing_admin_user(in_memory_db):
    s = _settings()
    # 第一次建立
    upsert_admin_user(in_memory_db, _ad_result(display_name="Old Name"), s)

    # 第二次更新（display_name 變更）
    result = upsert_admin_user(in_memory_db, _ad_result(display_name="New Name"), s)

    assert result.name == "New Name"
    assert result.email == "jdoe@test.local"
    assert result.email_verified_at is not None


def test_upsert_updates_email_when_provided(in_memory_db):
    s = _settings()
    upsert_admin_user(in_memory_db, _ad_result(mail=None), s)

    # 再次登入，這次有 mail
    result = upsert_admin_user(in_memory_db, _ad_result(mail="new@test.local"), s)

    assert result.email == "new@test.local"
    assert result.email_verified_at is not None


def test_upsert_no_email_does_not_clear_existing(in_memory_db):
    """AD 沒有回傳 mail 時，不覆蓋既有 email。"""
    s = _settings()
    upsert_admin_user(in_memory_db, _ad_result(mail="existing@test.local"), s)
    result = upsert_admin_user(in_memory_db, _ad_result(mail=None), s)

    assert result.email == "existing@test.local"


# ── emp_id 撞號（與 trainee 衝突）──────────────────────────────


def test_upsert_raises_collision_with_trainee(in_memory_db):
    """AD username 與 is_trainee=True 之既有帳號衝突 → EmpIdCollisionError（409）。"""
    s = _settings()

    # 先建立一個員工帳號
    dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    role = in_memory_db.query(Role).filter(Role.name == "User").first()
    trainee = User(
        emp_id="jdoe",
        name="員工",
        dept_id=dept.id,
        role_id=role.id,
        status="active",
        is_trainee=True,
    )
    in_memory_db.add(trainee)
    in_memory_db.commit()

    with pytest.raises(EmpIdCollisionError):
        upsert_admin_user(in_memory_db, _ad_result(username="jdoe"), s)


# ── 無 email 時 email_verified_at 為 None ───────────────────────


def test_upsert_no_mail_email_verified_at_none(in_memory_db):
    s = _settings()
    result = upsert_admin_user(in_memory_db, _ad_result(mail=None), s)

    assert result.email is None
    assert result.email_verified_at is None


# ── 自動建立角色與部門（若不存在）──────────────────────────────


def test_upsert_auto_creates_role_if_missing(in_memory_db):
    s = _settings(ad_admin_role_name="CustomAdmin")
    result = upsert_admin_user(in_memory_db, _ad_result(), s)

    role = in_memory_db.query(Role).filter(Role.name == "CustomAdmin").first()
    assert role is not None
    assert result.role_id == role.id
