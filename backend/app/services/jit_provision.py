"""
JIT（Just-in-Time）帳號建立與更新服務。

AD 管理員首次登入時自動建立本地帳號；後續登入更新 email、last_login_at 等欄位。
"""
from __future__ import annotations

import datetime
import logging

from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..models import Department, Role, User
from .ad_auth import AdAuthResult

logger = logging.getLogger(__name__)


class EmpIdCollisionError(Exception):
    """AD username 與既有員工帳號（is_trainee=True）的 emp_id 衝突。"""


def upsert_admin_user(
    db: Session,
    ad_result: AdAuthResult,
    settings: Settings | None = None,
) -> User:
    """
    JIT upsert：
    - emp_id = ad_result.ad_username（已 normalize 為小寫）
    - 撞號：is_trainee=True 之既有 emp_id → EmpIdCollisionError（409）
    - 新增：建立帳號並掛 AD_ADMIN_ROLE_NAME 角色、AD_DEFAULT_DEPT_NAME 部門
    - 更新：name, ad_username, email, email_verified_at, auth_source, last_login_at
    - 帳號一律設 is_trainee=False
    """
    if settings is None:
        settings = get_settings()

    emp_id = ad_result.ad_username  # 已 normalize（小寫）

    existing = db.query(User).filter(User.emp_id == emp_id).first()
    if existing and existing.is_trainee:
        raise EmpIdCollisionError(
            f"emp_id {emp_id!r} 已被員工帳號佔用，無法作為 AD 管理帳號"
        )

    role = _get_or_create_role(db, settings.ad_admin_role_name)
    dept = _get_or_create_dept(db, settings.ad_default_dept_name)

    now = datetime.datetime.utcnow()

    if existing is None:
        user = User(
            emp_id=emp_id,
            name=ad_result.display_name,
            dept_id=dept.id,
            role_id=role.id,
            status="active",
            auth_source="ad",
            ad_username=ad_result.ad_username,
            email=ad_result.mail,
            email_verified_at=now if ad_result.mail else None,
            is_trainee=False,
            last_login_at=now,
        )
        db.add(user)
        logger.info("JIT 建立管理帳號 emp_id=%s", emp_id)
    else:
        existing.name = ad_result.display_name
        existing.ad_username = ad_result.ad_username
        existing.auth_source = "ad"
        existing.last_login_at = now
        existing.role_id = role.id
        if ad_result.mail:
            existing.email = ad_result.mail
            existing.email_verified_at = now
        user = existing
        logger.info("JIT 更新管理帳號 emp_id=%s", emp_id)

    db.commit()
    db.refresh(user)
    return user


def _get_or_create_role(db: Session, role_name: str) -> Role:
    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        role = Role(name=role_name)
        db.add(role)
        db.commit()
        db.refresh(role)
        logger.warning("JIT 建立角色 %r（原本不存在，請確認 init_db 已執行）", role_name)
    return role


def _get_or_create_dept(db: Session, dept_name: str) -> Department:
    dept = db.query(Department).filter(Department.name == dept_name).first()
    if not dept:
        dept = Department(name=dept_name)
        db.add(dept)
        db.commit()
        db.refresh(dept)
        logger.warning("JIT 建立部門 %r（原本不存在）", dept_name)
    return dept
