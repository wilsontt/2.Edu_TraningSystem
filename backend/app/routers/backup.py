"""
排程備份路由 (Backup Schedule Router) — Wave 4

提供排程設定（啟用、頻率、時間、保留份數、NAS backup 帳密）、「立即備份」與
備份紀錄查詢。權限採獨立代碼 `menu:admin:backup`，可於系統管理之權限管理頁
單獨指派給特定角色（不與其他系統管理子功能共用）。
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from .. import models, schemas
from ..database import get_db
from .auth import check_permission
from ..services.backup_service import get_or_create_config, perform_backup
from ..services.crypto import encrypt_secret
from ..services.scheduler import reschedule_backup_job

router = APIRouter(prefix="/admin/backup", tags=["backup"])


def _to_config_out(config: models.BackupScheduleConfig) -> schemas.BackupScheduleConfigOut:
    return schemas.BackupScheduleConfigOut(
        enabled=config.enabled,
        frequency=config.frequency,
        time_of_day=config.time_of_day,
        weekday=config.weekday,
        retention_count=config.retention_count,
        destination=config.destination,
        backup_nas_username=config.backup_nas_username,
        has_password=bool(config.backup_nas_password_encrypted),
        updated_at=config.updated_at,
    )


@router.get("/config", response_model=schemas.BackupScheduleConfigOut)
def get_backup_config(
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin:backup"),
):
    config = get_or_create_config(db)
    return _to_config_out(config)


@router.put("/config", response_model=schemas.BackupScheduleConfigOut)
def update_backup_config(
    payload: schemas.BackupScheduleConfigUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin:backup"),
):
    config = get_or_create_config(db)
    config.enabled = payload.enabled
    config.frequency = payload.frequency
    config.time_of_day = payload.time_of_day
    config.weekday = payload.weekday if payload.frequency == "weekly" else None
    config.retention_count = payload.retention_count
    config.destination = payload.destination
    if payload.backup_nas_username is not None:
        config.backup_nas_username = payload.backup_nas_username or None
    if payload.backup_nas_password is not None:
        # 空字串視為清除密碼；非空才加密儲存
        config.backup_nas_password_encrypted = encrypt_secret(payload.backup_nas_password) if payload.backup_nas_password else None
    db.commit()
    db.refresh(config)

    reschedule_backup_job(config)
    return _to_config_out(config)


@router.post("/run-now", response_model=schemas.BackupRecordOut)
def run_backup_now(
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin:backup"),
):
    """立即執行一次備份（不受 enabled 開關限制）；同步等待結果。"""
    config = get_or_create_config(db)
    record = perform_backup(db, config)
    return record


@router.get("/records", response_model=schemas.BackupRecordList)
def list_backup_records(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin:backup"),
):
    q = db.query(models.BackupRecord)
    total = q.count()
    items = q.order_by(desc(models.BackupRecord.created_at)).offset((page - 1) * size).limit(size).all()
    return {
        "items": items, "total": total, "page": page, "size": size,
        "total_pages": (total + size - 1) // size,
    }
