"""套組內新增檔案（同名覆蓋 Yes/No）／移除單檔測試（教材 PLAN §5.12.8 S2/S4/S5/S12）。"""
import io

from app.models import MaterialType, MaterialFileFormat


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set(client, mt_id):
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "套組", "material_type_id": str(mt_id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_add_files_keeps_single_set_row(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)

    resp = client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        files=[
            ("files", ("b.pdf", io.BytesIO(b"y"), "application/pdf")),
            ("files", ("c.pdf", io.BytesIO(b"z"), "application/pdf")),
        ],
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["succeeded"]) == 2

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 3  # S2：同套組 3 檔，仍 1 列


def test_duplicate_filename_no_overwrite_skips(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)

    resp = client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        data={"overwrite_on_duplicate": "false"},
        files=[("files", ("a.pdf", io.BytesIO(b"new-content"), "application/pdf"))],
    )
    assert resp.status_code == 200
    assert resp.json()["succeeded"] == []
    assert "已跳過" in resp.json()["failed"][0]["reason"]

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1  # S4：舊檔保留，新檔不上傳


def test_duplicate_filename_overwrite_replaces_in_place(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    original_file_id = created["files"][0]["id"]

    resp = client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        data={"overwrite_on_duplicate": "true"},
        files=[("files", ("a.pdf", io.BytesIO(b"new-content"), "application/pdf"))],
    )
    assert resp.status_code == 200
    assert resp.json()["succeeded"][0]["id"] == original_file_id  # 沿用同一 id
    assert resp.json()["succeeded"][0]["overwritten"] is True

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1  # S5：覆寫，筆數不增
    assert detail["files"][0]["file_size_bytes"] == len(b"new-content")


def test_remove_one_file_leaves_others(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        files=[("files", ("b.pdf", io.BytesIO(b"y"), "application/pdf"))],
    )
    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    target_id = detail["files"][0]["id"]

    resp = client.delete(f"/api/admin/teaching-materials/sets/{created['id']}/files/{target_id}")
    assert resp.status_code == 200

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1  # S12：該檔軟刪，其餘不變
