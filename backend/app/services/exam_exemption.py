"""訓練計畫免考三層級解析（與受課對象分離）。"""
from __future__ import annotations

from typing import Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from .. import models
from ..constants.auth import SUPER_ADMIN_ROLE_NAMES, is_super_admin_role
from .attendance_checkin import user_in_plan_targets


def merge_exam_exempt_role_ids(
    db: Session,
    role_ids: Optional[Iterable[int]] = None,
) -> List[int]:
    """合併客戶端免考角色與預設超管角色（強制保留）。"""
    ids: Set[int] = set(int(x) for x in (role_ids or []))
    for role in (
        db.query(models.Role)
        .filter(models.Role.name.in_(list(SUPER_ADMIN_ROLE_NAMES)))
        .all()
    ):
        ids.add(role.id)
    return sorted(ids)


def user_is_exam_exempt(user: models.User, plan: models.TrainingPlan) -> bool:
    """免考 = 免考角色 ∪ 免考單位 ∪ 免考個人（OR）。"""
    if user.role_id is not None and any(
        r.id == user.role_id for r in (plan.exam_exempt_roles or [])
    ):
        return True
    if user.dept_id is not None and any(
        d.id == user.dept_id for d in (plan.exam_exempt_departments or [])
    ):
        return True
    if any(u.emp_id == user.emp_id for u in (plan.exam_exempt_users or [])):
        return True
    return False


def user_requires_exam(user: models.User, plan: models.TrainingPlan) -> bool:
    return user_in_plan_targets(user, plan) and not user_is_exam_exempt(user, plan)


def user_requires_checkin(user: models.User, plan: models.TrainingPlan) -> bool:
    """僅預設超管免報到；其餘受課對象（含一般免考）仍須報到。"""
    if not user_in_plan_targets(user, plan):
        return False
    role_name = (user.role.name if user.role else "") or ""
    if is_super_admin_role(role_name):
        return False
    return True


def _active_trainee_query(db: Session):
    return db.query(models.User).filter(
        models.User.status == "active",
        models.User.is_trainee == True,  # noqa: E712
    )


def resolve_assigned_emp_ids(plan: models.TrainingPlan, db: Session) -> Set[str]:
    """應考母集合：受課單位全員 ∪ 個人受課；皆空＝全公司在職受訓者。"""
    has_targets = bool(plan.target_departments) or bool(plan.target_users)
    ids: Set[str] = set()

    if not has_targets:
        for u in _active_trainee_query(db).all():
            ids.add(u.emp_id)
        return ids

    if plan.target_departments:
        dept_ids = [d.id for d in plan.target_departments]
        for u in (
            _active_trainee_query(db)
            .filter(models.User.dept_id.in_(dept_ids))
            .all()
        ):
            ids.add(u.emp_id)

    if plan.target_users:
        for u in plan.target_users:
            if u.status == "active" and u.is_trainee:
                ids.add(u.emp_id)

    return ids


def resolve_exempt_emp_ids(plan: models.TrainingPlan, db: Session) -> Set[str]:
    """免考 emp_id 集合（僅計在職受訓者；超管角色成員亦列入以便從需考扣除）。"""
    ids: Set[str] = set()

    role_ids = [r.id for r in (plan.exam_exempt_roles or [])]
    if role_ids:
        for u in (
            db.query(models.User)
            .filter(
                models.User.role_id.in_(role_ids),
                models.User.status == "active",
            )
            .all()
        ):
            ids.add(u.emp_id)

    dept_ids = [d.id for d in (plan.exam_exempt_departments or [])]
    if dept_ids:
        for u in (
            _active_trainee_query(db)
            .filter(models.User.dept_id.in_(dept_ids))
            .all()
        ):
            ids.add(u.emp_id)

    for u in plan.exam_exempt_users or []:
        if u.status == "active":
            ids.add(u.emp_id)

    return ids


def resolve_exam_required_emp_ids(plan: models.TrainingPlan, db: Session) -> Set[str]:
    return resolve_assigned_emp_ids(plan, db) - resolve_exempt_emp_ids(plan, db)


def resolve_checkin_expected_emp_ids(plan: models.TrainingPlan, db: Session) -> Set[str]:
    """應到＝母集合 − 預設超管角色成員。"""
    assigned = resolve_assigned_emp_ids(plan, db)
    if not assigned:
        return set()

    users = (
        db.query(models.User)
        .filter(models.User.emp_id.in_(list(assigned)))
        .all()
    )
    result: Set[str] = set()
    for u in users:
        role_name = (u.role.name if u.role else "") or ""
        if is_super_admin_role(role_name):
            continue
        result.add(u.emp_id)
    return result


def apply_exam_exemptions(
    db: Session,
    plan: models.TrainingPlan,
    *,
    role_ids: Optional[List[int]] = None,
    dept_ids: Optional[List[int]] = None,
    user_ids: Optional[List[str]] = None,
) -> None:
    """寫入計畫免考關聯；強制保留超管角色。無效 id 拋 ValueError。"""
    merged_role_ids = merge_exam_exempt_role_ids(db, role_ids)
    roles = (
        db.query(models.Role).filter(models.Role.id.in_(merged_role_ids)).all()
        if merged_role_ids
        else []
    )
    if len(roles) != len(set(merged_role_ids)):
        raise ValueError("免考角色不存在")

    dept_id_list = list(dept_ids or [])
    depts = (
        db.query(models.Department)
        .filter(models.Department.id.in_(dept_id_list))
        .all()
        if dept_id_list
        else []
    )
    if len(depts) != len(set(dept_id_list)):
        raise ValueError("免考單位不存在")

    emp_id_list = list(user_ids or [])
    users = (
        db.query(models.User)
        .filter(
            models.User.emp_id.in_(emp_id_list),
            models.User.status == "active",
        )
        .all()
        if emp_id_list
        else []
    )
    # 允許請求含停用員編時僅保留在職；若全部無效且有請求則 400
    if emp_id_list and not users and len(emp_id_list) > 0:
        # 若請求的人都停用／不存在
        found_any = (
            db.query(models.User.emp_id)
            .filter(models.User.emp_id.in_(emp_id_list))
            .first()
        )
        if not found_any:
            raise ValueError("免考個人不存在")

    plan.exam_exempt_roles = roles
    plan.exam_exempt_departments = depts
    plan.exam_exempt_users = users
