"""教材套組 API 測試：建立套組（POST /sets）。"""
import io
from contextlib import contextmanager

from app import models
from app.models import MaterialType, MaterialFileFormat, FileTransferAuditLog, Department


def _seed_material_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", sort_order=1, is_active=True)
    db.add(mt)
    fmt = MaterialFileFormat(ext="pdf", label="PDF", is_active=True)
    db.add(fmt)
    db.commit()
    return mt


def _seed_dept_id(db) -> str:
    dept = db.query(Department).filter(Department.name == "IT部").first()
    return str(dept.id)


def test_create_set_with_two_files(client, in_memory_db):
    mt = _seed_material_type(in_memory_db)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={
            "title": "安全教育教材",
            "material_type_id": str(mt.id),
            "dept_id": _seed_dept_id(in_memory_db),
            "nas_session_token": "fake-token-not-used",
        },
        files=[
            ("files", ("a.pdf", io.BytesIO(b"AAA"), "application/pdf")),
            ("files", ("b.pdf", io.BytesIO(b"BBB"), "application/pdf")),
        ],
    )
    # 未做 NAS session 驗證 mock，預期在 NAS 憑證解析階段回傳 401
    assert resp.status_code == 401
    assert "NAS" in resp.json()["detail"]


def test_create_set_rejects_disallowed_extension(client, in_memory_db):
    mt = _seed_material_type(in_memory_db)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "測試", "material_type_id": str(mt.id), "dept_id": _seed_dept_id(in_memory_db)},
        files=[("files", ("virus.exe", io.BytesIO(b"AAA"), "application/octet-stream"))],
    )
    assert resp.status_code == 400
    assert "格式" in resp.json()["detail"]


def test_create_set_success_records_audit_log_in_memory(client, in_memory_db, monkeypatch):
    """成功建立套組（NAS 成功路徑）須寫入 FileTransferAuditLog，且寫入的是 in-memory
    測試 db（而非正式 data/education_training.db）。

    此測試同時 mock 掉 `_resolve_credentials` 與 `storage.connection`，模擬 NAS 連線／
    寫檔成功，藉此驗證 create_set 成功路徑中的 record_file_transfer() 呼叫。
    """
    from app.routers import teaching_material_sets
    from app.services import storage

    mt = _seed_material_type(in_memory_db)

    fake_creds = storage.SmbCredentials(
        server="nas.local", share="materials", username="tester",
        password="pw", root="materials",
    )
    monkeypatch.setattr(
        teaching_material_sets, "_resolve_credentials",
        lambda *args, **kwargs: fake_creds,
    )

    class _FakeSmbStorage:
        def save(self, rel_path, data):
            return len(data)

    @contextmanager
    def _fake_connection(creds):
        yield _FakeSmbStorage()

    monkeypatch.setattr(storage, "connection", _fake_connection)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={
            "title": "安全教育教材（成功路徑）",
            "material_type_id": str(mt.id),
            "dept_id": _seed_dept_id(in_memory_db),
            "nas_session_token": "fake-token",
        },
        files=[("files", ("c.pdf", io.BytesIO(b"CCC"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text

    # 稽核紀錄必須出現在 in_memory_db（測試 session），而非正式 DB；
    # 若 audit_log.SessionLocal 未被 client fixture 綁定到相同 in-memory engine，
    # 此筆紀錄會被寫入真實的 data/education_training.db，這裡的 count 會是 0。
    assert in_memory_db.query(FileTransferAuditLog).count() == 1
    log = in_memory_db.query(FileTransferAuditLog).first()
    assert log.action == "upload"
    assert log.resource_type == "teaching_material"
    assert log.status == "success"
    assert log.filename == "c.pdf"


def test_create_set_second_file_failure_rolls_back_atomically(client, in_memory_db, monkeypatch):
    """兩檔案上傳，第一檔成功、第二檔在 NAS 寫入階段失敗，須完全回滾（atomic
    all-or-nothing），不得殘留任何 `TeachingMaterialSet` 資料列。

    此測試重現：`record_file_transfer()`（第一檔成功後觸發）使用獨立 session
    commit，若該 session 與路由自身 session 共用同一實體連線（舊版
    `:memory:` + `StaticPool`），會連帶把路由自身尚未 commit 的
    `TeachingMaterialSet` 一併物理提交；此時第二檔失敗觸發的 `db.rollback()`
    對已被連帶提交的資料形同無效，導致殘留 1 筆 `TeachingMaterialSet`。
    改用暫存檔 SQLite（各 session 各自連線）後，`record_file_transfer` 的
    commit 不會波及路由自身尚未提交的交易，rollback 應能完全清空。
    """
    from app.routers import teaching_material_sets
    from app.services import storage

    mt = _seed_material_type(in_memory_db)

    fake_creds = storage.SmbCredentials(
        server="nas.local", share="materials", username="tester",
        password="pw", root="materials",
    )
    monkeypatch.setattr(
        teaching_material_sets, "_resolve_credentials",
        lambda *args, **kwargs: fake_creds,
    )

    class _FakeSmbStorage:
        def __init__(self):
            self.save_calls = 0

        def save(self, rel_path, data):
            self.save_calls += 1
            if self.save_calls == 2:
                raise storage.StorageError("模擬第二檔寫入失敗")
            return len(data)

    @contextmanager
    def _fake_connection(creds):
        yield _FakeSmbStorage()

    monkeypatch.setattr(storage, "connection", _fake_connection)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={
            "title": "安全教育教材（部分失敗）",
            "material_type_id": str(mt.id),
            "dept_id": _seed_dept_id(in_memory_db),
            "nas_session_token": "fake-token",
        },
        files=[
            ("files", ("d.pdf", io.BytesIO(b"DDD"), "application/pdf")),
            ("files", ("e.pdf", io.BytesIO(b"EEE"), "application/pdf")),
        ],
    )
    assert resp.status_code == 422, resp.text

    # 第二檔失敗須讓整筆交易回滾，不得殘留 TeachingMaterialSet（atomic all-or-nothing）。
    assert in_memory_db.query(models.TeachingMaterialSet).count() == 0
