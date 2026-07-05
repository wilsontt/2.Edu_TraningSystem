"""
排程備份核心邏輯（Wave 4；NAS PLAN §5.5）。

**僅備份 SQLite 資料庫本體**（一致性備份，sqlite3 backup API），打包為 ZIP（含
manifest.json）後以 backup 模式上傳至 NAS。教材／考卷實體檔已存於 NAS、由 NAS
端既有 3-2-1 備援機制保障，本服務不重複打包，避免每次備份都要把整個 materials
樹從 NAS 下載、重新打包、再上傳回 NAS 的龐大且無意義的成本。

依保留份數（retention_count）清除最舊備份；任何失敗皆寫入 BackupRecord 而不
拋出例外，確保排程 job 不會因單次失敗而中斷後續排程。
"""

from __future__ import annotations

import io
import json
import os
import sqlite3
import tempfile
import time
import zipfile
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal, _db_path
from . import storage
from .crypto import decrypt_secret, CredentialEncryptionError

APP_VERSION = "1.2.0"
SCHEMA_VERSION = "1"
BACKUP_FILENAME_PREFIX = "education_training_backup_"


def get_or_create_config(db: Session) -> models.BackupScheduleConfig:
    """取得單例排程設定（id=1）；不存在時建立預設值。"""
    config = db.query(models.BackupScheduleConfig).filter(models.BackupScheduleConfig.id == 1).first()
    if not config:
        config = models.BackupScheduleConfig(
            id=1, enabled=False, frequency="daily", time_of_day="02:00", retention_count=7,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _sqlite_consistency_backup(dest_path: str) -> None:
    """以 sqlite3 backup API 做線上一致性備份，避免於寫入中複製造成 DB 檔毀損。"""
    src = sqlite3.connect(_db_path)
    try:
        dst = sqlite3.connect(dest_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _build_backup_zip(tmp_db_path: str) -> bytes:
    """打包一致性備份的 DB 檔 + manifest.json（見 NAS PLAN §7.3）為 ZIP bytes。"""
    db_size = os.path.getsize(tmp_db_path)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "created_at": datetime.utcnow().isoformat(),
        "app_version": APP_VERSION,
        "db_file": "education_training.db",
        "db_size_bytes": db_size,
        "note": "教材／考卷實體檔存於 NAS，已由 NAS 端 3-2-1 備援機制保障，本備份僅含資料庫本體。",
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(tmp_db_path, arcname="education_training.db")
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    return buf.getvalue()


def _apply_retention(st: storage.SmbStorage, retention_count: int) -> None:
    """依保留份數刪除最舊備份（依檔名時間戳排序，僅作用於本服務產生的備份檔）。"""
    items = st.list("")
    backups = [
        it for it in items
        if it["filename"].startswith(BACKUP_FILENAME_PREFIX) and it["filename"].endswith(".zip")
    ]
    backups.sort(key=lambda it: it["mtime"])
    overflow = len(backups) - retention_count
    for it in backups[: max(overflow, 0)]:
        try:
            st.delete(it["filename"])
        except storage.StorageError:
            pass


def perform_backup(db: Session, config: Optional[models.BackupScheduleConfig] = None) -> models.BackupRecord:
    """執行一次備份（排程 job 與「立即備份」皆呼叫此函式）。
    任何失敗皆記錄為 BackupRecord(status='failed')，不向呼叫端拋出例外。"""
    if config is None:
        config = get_or_create_config(db)

    started = time.monotonic()
    filename = f"{BACKUP_FILENAME_PREFIX}{datetime.now().strftime('%Y%m%d_%H%M')}.zip"
    record = models.BackupRecord(filename=filename, status="failed")

    tmp_path: Optional[str] = None
    try:
        if not config.backup_nas_username or not config.backup_nas_password_encrypted:
            raise storage.StorageUnavailable("排程備份尚未設定 NAS 帳號或密碼")
        password = decrypt_secret(config.backup_nas_password_encrypted)

        fd, tmp_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        _sqlite_consistency_backup(tmp_path)
        zip_bytes = _build_backup_zip(tmp_path)

        creds = storage.backup_credentials(config.backup_nas_username, password, config.destination)
        with storage.connection(creds) as st:
            st.save(filename, zip_bytes)
            _apply_retention(st, config.retention_count)

        record.status = "success"
        record.size_bytes = len(zip_bytes)
    except CredentialEncryptionError as e:
        record.message = str(e)
    except storage.StorageError as e:
        record.message = str(e)
    except Exception as e:  # noqa: BLE001 - 排程 job 不得因未預期錯誤中斷
        record.message = f"未預期錯誤：{e}"
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        record.duration_ms = int((time.monotonic() - started) * 1000)

    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def run_scheduled_backup() -> None:
    """APScheduler 排程觸發入口：建立獨立 Session、確認仍啟用、執行備份、確保關閉。"""
    db = SessionLocal()
    try:
        config = get_or_create_config(db)
        if not config.enabled:
            return
        perform_backup(db, config)
    finally:
        db.close()
