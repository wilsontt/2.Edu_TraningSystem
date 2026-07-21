"""報到事件與合併批次共用 helper。"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from .. import models


def now_utc_naive() -> datetime:
    return datetime.utcnow()


def user_in_plan_targets(user: models.User, plan: models.TrainingPlan) -> bool:
    """受課對象 = 受課單位全員 ∪ 個人受課對象；兩者皆未設定視為全公司。"""
    has_targets = bool(plan.target_departments) or bool(plan.target_users)
    if not has_targets:
        return True
    in_dept = user.dept_id is not None and any(
        dept.id == user.dept_id for dept in plan.target_departments
    )
    in_users = any(u.emp_id == user.emp_id for u in plan.target_users)
    return in_dept or in_users


def plan_is_active_for_batch(plan: models.TrainingPlan, today: Optional[date] = None) -> bool:
    today = today or date.today()
    if plan.is_archived:
        return False
    if plan.end_date is not None and plan.end_date < today:
        return False
    return True


def checkin_user_brief(user: models.User) -> dict[str, str]:
    """報到 API 回傳用：部門名稱、員工編號、姓名。"""
    dept = user.department.name if user.department else "未知"
    return {
        "emp_id": user.emp_id,
        "name": user.name,
        "dept_name": dept,
    }


def append_checkin_event(
    db: Session,
    *,
    emp_id: str,
    plan_id: int,
    event_type: str,
    source: str,
    result: str,
    batch_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    event_time: Optional[datetime] = None,
) -> models.AttendanceCheckinEvent:
    ev = models.AttendanceCheckinEvent(
        emp_id=emp_id,
        plan_id=plan_id,
        event_time=event_time or now_utc_naive(),
        event_type=event_type,
        batch_id=batch_id,
        source=source,
        result=result,
        ip_address=ip_address,
    )
    db.add(ev)
    return ev


def client_ip_from_request(request) -> Optional[str]:
    if not request:
        return None
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    if "x-real-ip" in request.headers:
        return request.headers["x-real-ip"]
    return request.client.host if request.client else None
