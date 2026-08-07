"""排程備份：連線測試、紀錄分頁、批次刪除（可選刪 NAS）API 測試。"""
from __future__ import annotations

import contextlib
from datetime import datetime

import pytest
from cryptography.fernet import Fernet

from app.models import BackupRecord, BackupScheduleConfig
from app.services import storage
from app.services.crypto import encrypt_secret


class _BackupStubStorage:
    """假 NAS：支援 list／delete／save，供備份連線測試與批次刪除。"""

    def __init__(self):
        self.saved: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.connect_should_fail = False
        self.delete_fail_files: set[str] = set()

    def save(self, rel_path: str, data: bytes) -> int:
        self.saved[rel_path] = data
        return len(data)

    def list(self, rel_dir: str = "") -> list[dict]:
        return [
            {"filename": name, "size": len(data), "mtime": 0.0}
            for name, data in self.saved.items()
        ]

    def delete(self, rel_path: str) -> None:
        if rel_path in self.delete_fail_files:
            raise storage.StorageError(f"刪除失敗（{rel_path}）")
        if rel_path not in self.saved:
            raise storage.StorageError(f"檔案不存在（{rel_path}）")
        del self.saved[rel_path]
        self.deleted.append(rel_path)


@pytest.fixture
def smb_settings(monkeypatch):
    """啟用 SMB 與 Fernet 金鑰（就地 patch settings，避免 cache_clear 重讀 .env）。"""
    from app.config import get_settings

    settings = get_settings()
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setattr(settings, "credential_secret", key)
    monkeypatch.setattr(settings, "smb_server", "test-nas")
    monkeypatch.setattr(settings, "smb_share", "test-share")
    monkeypatch.setattr(settings, "backup_root", "backups")
    yield settings


@pytest.fixture
def backup_stub(monkeypatch, smb_settings):
    """Monkeypatch storage.connection；回傳 stub 供斷言。"""
    stub = _BackupStubStorage()

    @contextlib.contextmanager
    def _fake_connection(creds):
        if stub.connect_should_fail:
            raise storage.StorageUnavailable("無法連線 NAS")
        yield stub

    monkeypatch.setattr(storage, "connection", _fake_connection)
    return stub


def _ensure_config(db, *, username="backup-user", password="secret", destination="backups/training"):
    config = db.query(BackupScheduleConfig).filter(BackupScheduleConfig.id == 1).first()
    if not config:
        config = BackupScheduleConfig(id=1, enabled=False, frequency="daily", time_of_day="02:00", retention_count=7)
        db.add(config)
    config.backup_nas_username = username
    config.backup_nas_password_encrypted = encrypt_secret(password)
    config.destination = destination
    db.commit()
    db.refresh(config)
    return config


def _add_record(db, *, filename: str, status: str = "success") -> BackupRecord:
    rec = BackupRecord(
        filename=filename,
        status=status,
        size_bytes=100,
        message=None,
        duration_ms=10,
        created_at=datetime.utcnow(),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


# ── 連線測試 ──────────────────────────────────────────────────────


def test_test_connection_success_with_saved_credentials(client, in_memory_db, backup_stub):
    _ensure_config(in_memory_db)

    resp = client.post("/api/admin/backup/test-connection", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert "成功" in body["message"]


def test_test_connection_uses_request_body_credentials(client, in_memory_db, backup_stub):
    _ensure_config(in_memory_db, username="old-user", password="old-pass")

    resp = client.post(
        "/api/admin/backup/test-connection",
        json={
            "backup_nas_username": "new-user",
            "backup_nas_password": "new-pass",
            "destination": "backups/other",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True


def test_test_connection_fails_when_nas_unreachable(client, in_memory_db, backup_stub):
    _ensure_config(in_memory_db)
    backup_stub.connect_should_fail = True

    resp = client.post("/api/admin/backup/test-connection", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["message"]


def test_test_connection_missing_credentials_returns_ok_false(client, in_memory_db, smb_settings):
    config = in_memory_db.query(BackupScheduleConfig).filter(BackupScheduleConfig.id == 1).first()
    if not config:
        config = BackupScheduleConfig(id=1, enabled=False, frequency="daily", time_of_day="02:00", retention_count=7)
        in_memory_db.add(config)
    config.backup_nas_username = None
    config.backup_nas_password_encrypted = None
    in_memory_db.commit()

    resp = client.post("/api/admin/backup/test-connection", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert "帳號" in body["message"] or "密碼" in body["message"]


# ── 紀錄分頁 ──────────────────────────────────────────────────────


def test_list_records_pagination(client, in_memory_db, smb_settings):
    for i in range(5):
        _add_record(in_memory_db, filename=f"education_training_backup_2026010{i}_1200.zip")

    resp = client.get("/api/admin/backup/records", params={"page": 1, "size": 2})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 5
    assert body["page"] == 1
    assert body["size"] == 2
    assert body["total_pages"] == 3
    assert len(body["items"]) == 2


# ── 批次刪除 ──────────────────────────────────────────────────────


def test_bulk_delete_records_only(client, in_memory_db, backup_stub):
    _ensure_config(in_memory_db)
    a = _add_record(in_memory_db, filename="education_training_backup_20260101_1200.zip")
    b = _add_record(in_memory_db, filename="education_training_backup_20260102_1200.zip")
    backup_stub.saved[a.filename] = b"zip"
    backup_stub.saved[b.filename] = b"zip"

    resp = client.request(
        "DELETE",
        "/api/admin/backup/records/bulk-delete",
        json={"record_ids": [a.id, b.id], "delete_nas_files": False},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 2
    assert body["missing_ids"] == []
    assert body["nas_deleted_count"] == 0
    assert body["nas_failed"] == []
    assert a.filename in backup_stub.saved  # NAS 未刪
    assert in_memory_db.query(BackupRecord).count() == 0


def test_bulk_delete_records_and_nas_files(client, in_memory_db, backup_stub):
    _ensure_config(in_memory_db)
    a = _add_record(in_memory_db, filename="education_training_backup_20260101_1200.zip")
    b = _add_record(in_memory_db, filename="education_training_backup_20260102_1200.zip")
    backup_stub.saved[a.filename] = b"zip"
    backup_stub.saved[b.filename] = b"zip"

    resp = client.request(
        "DELETE",
        "/api/admin/backup/records/bulk-delete",
        json={"record_ids": [a.id, b.id], "delete_nas_files": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 2
    assert body["nas_deleted_count"] == 2
    assert body["nas_failed"] == []
    assert a.filename not in backup_stub.saved
    assert b.filename not in backup_stub.saved


def test_bulk_delete_nas_missing_file_still_deletes_record(client, in_memory_db, backup_stub):
    """NAS 無對應檔時視為可忽略，仍刪除 DB 紀錄。"""
    _ensure_config(in_memory_db)
    a = _add_record(in_memory_db, filename="education_training_backup_missing.zip")

    resp = client.request(
        "DELETE",
        "/api/admin/backup/records/bulk-delete",
        json={"record_ids": [a.id], "delete_nas_files": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 1
    assert body["nas_deleted_count"] == 0
    assert in_memory_db.query(BackupRecord).count() == 0


def test_bulk_delete_empty_ids_returns_400(client, in_memory_db, smb_settings):
    resp = client.request(
        "DELETE",
        "/api/admin/backup/records/bulk-delete",
        json={"record_ids": [], "delete_nas_files": False},
    )
    assert resp.status_code == 400


def test_bulk_delete_reports_missing_ids(client, in_memory_db, backup_stub):
    _ensure_config(in_memory_db)
    a = _add_record(in_memory_db, filename="education_training_backup_20260101_1200.zip")

    resp = client.request(
        "DELETE",
        "/api/admin/backup/records/bulk-delete",
        json={"record_ids": [a.id, 999999], "delete_nas_files": False},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 1
    assert body["missing_ids"] == [999999]


def test_bulk_delete_nas_true_but_connection_fails_aborts(client, in_memory_db, backup_stub):
    """勾選刪 NAS 但連線失敗時，不刪 DB 紀錄。"""
    _ensure_config(in_memory_db)
    a = _add_record(in_memory_db, filename="education_training_backup_20260101_1200.zip")
    backup_stub.saved[a.filename] = b"zip"
    backup_stub.connect_should_fail = True

    resp = client.request(
        "DELETE",
        "/api/admin/backup/records/bulk-delete",
        json={"record_ids": [a.id], "delete_nas_files": True},
    )
    assert resp.status_code == 503
    assert in_memory_db.query(BackupRecord).count() == 1
    assert a.filename in backup_stub.saved
