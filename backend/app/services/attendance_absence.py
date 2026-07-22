"""
報到未到原因與歷程事件輔助函式（方案 B：batch 表 + plan upsert + append event）。
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Set

from sqlalchemy.orm import Session

from .. import models

ABSENCE_REASON_CODES = frozenset(
    {"sick_leave", "business_trip", "official_leave", "other", "cancel_leave"}
)

ABSENCE_REASON_LABELS = {
    "sick_leave": "病假",
    "business_trip": "出差",
    "official_leave": "公假",
    "other": "其他",
    "cancel_leave": "取消請假",
}


def format_checkin_event_display_label(
    *,
    source: str,
    event_type: str,
    result: str,
    batch_label: Optional[str] = None,
    reason_code: Optional[str] = None,
    reason_text: Optional[str] = None,
) -> str:
    """後端中文友善標籤（與前端 formatAttendanceCheckinEventLabel 對齊）。"""
    if event_type in ("absence_reason_updated", "absence_reason_cleared") or source in (
        "batch_absence",
        "plan_absence",
    ):
        if event_type == "absence_reason_cleared" or result == "cleared":
            base = "取消請假"
        else:
            code = reason_code or ""
            base = ABSENCE_REASON_LABELS.get(code, code or "未到原因")
            if code == "other" and (reason_text or "").strip():
                base = f"{base}：{reason_text.strip()}"
        if source == "batch_absence":
            tag = (batch_label or "").strip()
            return f"{base}（合併報到「{tag}」）" if tag else f"{base}（合併報到）"
        if source == "plan_absence":
            return f"{base}（個別覆寫）" if result == "override" else base
        return base

    outcome_map = {
        "success": "準時報到",
        "already_checked": "已報到過",
        "skipped_not_target": "非本計畫對象",
        "plan_not_applicable": "計畫未開放／已過期",
        "batch_closed": "合併報到已關閉",
    }
    outcome = outcome_map.get(result, result)

    if source == "qr_batch" or event_type == "batch_checkin":
        tag = (batch_label or "").strip()
        return f"合併報到「{tag}」· {outcome}" if tag else f"合併報到 · {outcome}"
    if source == "qr_single" or event_type == "single_checkin":
        return f"計畫 QR · {outcome}"
    if source == "exam_center_button":
        return f"考試中心報到 · {outcome}"
    return f"報到 · {outcome}"


def collect_plan_target_emp_ids(plan: models.TrainingPlan, db: Session) -> Set[str]:
    """收集計畫應到對象（在職受訓者）。"""
    ids: Set[str] = set()
    if plan.target_departments:
        dept_ids = [d.id for d in plan.target_departments]
        for u in (
            db.query(models.User)
            .filter(
                models.User.dept_id.in_(dept_ids),
                models.User.status == "active",
                models.User.is_trainee == True,  # noqa: E712
            )
            .all()
        ):
            ids.add(u.emp_id)
    if plan.target_users:
        for u in plan.target_users:
            if u.status == "active" and u.is_trainee:
                ids.add(u.emp_id)
    return ids


def is_checked_in(db: Session, plan_id: int, emp_id: str) -> bool:
    return (
        db.query(models.AttendanceRecord.id)
        .filter(
            models.AttendanceRecord.plan_id == plan_id,
            models.AttendanceRecord.emp_id == emp_id,
        )
        .first()
        is not None
    )


def append_absence_event(
    db: Session,
    *,
    plan_id: int,
    emp_id: str,
    operator_emp_id: str,
    reason_code: Optional[str],
    reason_text: Optional[str],
    source: str,
    batch_id: Optional[str] = None,
    cleared: bool = False,
    is_override: bool = False,
    event_time: Optional[datetime] = None,
) -> models.AttendanceCheckinEvent:
    now = event_time or datetime.utcnow()
    ev = models.AttendanceCheckinEvent(
        emp_id=emp_id,
        plan_id=plan_id,
        event_time=now,
        event_type="absence_reason_cleared" if cleared else "absence_reason_updated",
        batch_id=batch_id,
        source=source,
        result="cleared" if cleared else ("override" if is_override else "updated"),
        reason_code=None if cleared else reason_code,
        reason_text=None if cleared else reason_text,
        operator_emp_id=operator_emp_id,
    )
    db.add(ev)
    return ev


def upsert_plan_absence_reason(
    db: Session,
    *,
    plan_id: int,
    emp_id: str,
    reason_code: str,
    reason_text: Optional[str],
    recorded_by: str,
    now: Optional[datetime] = None,
) -> None:
    now = now or datetime.utcnow()
    existing = (
        db.query(models.AttendanceAbsenceReason)
        .filter(
            models.AttendanceAbsenceReason.plan_id == plan_id,
            models.AttendanceAbsenceReason.emp_id == emp_id,
        )
        .first()
    )
    if existing:
        existing.reason_code = reason_code
        existing.reason_text = reason_text
        existing.recorded_by = recorded_by
        existing.recorded_at = now
    else:
        db.add(
            models.AttendanceAbsenceReason(
                plan_id=plan_id,
                emp_id=emp_id,
                reason_code=reason_code,
                reason_text=reason_text,
                recorded_by=recorded_by,
                recorded_at=now,
            )
        )


def delete_plan_absence_reason(db: Session, plan_id: int, emp_id: str) -> bool:
    existing = (
        db.query(models.AttendanceAbsenceReason)
        .filter(
            models.AttendanceAbsenceReason.plan_id == plan_id,
            models.AttendanceAbsenceReason.emp_id == emp_id,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        return True
    return False


def upsert_batch_absence_reason(
    db: Session,
    *,
    batch_id: str,
    emp_id: str,
    reason_code: str,
    reason_text: Optional[str],
    recorded_by: str,
    now: Optional[datetime] = None,
) -> None:
    now = now or datetime.utcnow()
    existing = (
        db.query(models.AttendanceBatchAbsenceReason)
        .filter(
            models.AttendanceBatchAbsenceReason.batch_id == batch_id,
            models.AttendanceBatchAbsenceReason.emp_id == emp_id,
        )
        .first()
    )
    if existing:
        existing.reason_code = reason_code
        existing.reason_text = reason_text
        existing.recorded_by = recorded_by
        existing.recorded_at = now
    else:
        db.add(
            models.AttendanceBatchAbsenceReason(
                batch_id=batch_id,
                emp_id=emp_id,
                reason_code=reason_code,
                reason_text=reason_text,
                recorded_by=recorded_by,
                recorded_at=now,
            )
        )


def delete_batch_absence_reason(db: Session, batch_id: str, emp_id: str) -> bool:
    existing = (
        db.query(models.AttendanceBatchAbsenceReason)
        .filter(
            models.AttendanceBatchAbsenceReason.batch_id == batch_id,
            models.AttendanceBatchAbsenceReason.emp_id == emp_id,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        return True
    return False
