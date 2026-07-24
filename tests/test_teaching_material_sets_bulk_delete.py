"""教材庫檔案／套組批次軟刪除 API 測試。"""
import io

from app.models import (
    MaterialType, MaterialFileFormat, Department,
    TeachingMaterialFile, TeachingMaterialSet,
)


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set_with_files(client, db, mt_id, title="批次刪除套組", filenames=("a.pdf", "b.pdf", "c.pdf")):
    dept = db.query(Department).filter(Department.name == "IT部").first()
    files = [("files", (name, io.BytesIO(b"x" * (i + 1)), "application/pdf")) for i, name in enumerate(filenames)]
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": title, "material_type_id": str(mt_id), "dept_id": str(dept.id)},
        files=files,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_bulk_delete_files_soft_deletes_selected(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set_with_files(client, in_memory_db, mt.id)
    file_ids = [f["id"] for f in created["files"]]
    assert len(file_ids) == 3

    target = file_ids[:2]
    resp = client.request(
        "DELETE",
        "/api/admin/teaching-materials/files/bulk-delete",
        json={"file_ids": target},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 2
    assert body["missing_ids"] == []
    assert body["denied_ids"] == []

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1
    assert detail["files"][0]["id"] == file_ids[2]

    # DB 仍保留列，僅 is_active=False
    rows = (
        in_memory_db.query(TeachingMaterialFile)
        .filter(TeachingMaterialFile.id.in_(target))
        .all()
    )
    assert all(r.is_active is False for r in rows)


def test_bulk_delete_files_empty_ids_returns_400(client, in_memory_db, mock_nas):
    resp = client.request(
        "DELETE",
        "/api/admin/teaching-materials/files/bulk-delete",
        json={"file_ids": []},
    )
    assert resp.status_code == 400
    assert "不可為空" in resp.json()["detail"]


def test_bulk_delete_files_reports_missing_ids(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set_with_files(client, in_memory_db, mt.id, filenames=("a.pdf",))
    real_id = created["files"][0]["id"]
    missing_id = 999999

    resp = client.request(
        "DELETE",
        "/api/admin/teaching-materials/files/bulk-delete",
        json={"file_ids": [real_id, missing_id]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 1
    assert body["missing_ids"] == [missing_id]
    assert body["denied_ids"] == []


def test_bulk_delete_sets_soft_deletes_and_hides_from_list(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    a = _create_set_with_files(client, in_memory_db, mt.id, title="套組A", filenames=("a.pdf",))
    b = _create_set_with_files(client, in_memory_db, mt.id, title="套組B", filenames=("b.pdf",))
    _create_set_with_files(client, in_memory_db, mt.id, title="套組C", filenames=("c.pdf",))

    resp = client.request(
        "DELETE",
        "/api/admin/teaching-materials/sets/bulk-delete",
        json={"set_ids": [a["id"], b["id"]]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 2
    assert body["missing_ids"] == []
    assert body["denied_ids"] == []

    listing = client.get("/api/admin/teaching-materials/sets", params={"page": 1, "size": 20}).json()
    titles = {item["title"] for item in listing["items"]}
    assert "套組A" not in titles
    assert "套組B" not in titles
    assert "套組C" in titles

    rows = (
        in_memory_db.query(TeachingMaterialSet)
        .filter(TeachingMaterialSet.id.in_([a["id"], b["id"]]))
        .all()
    )
    assert all(r.is_active is False for r in rows)


def test_bulk_delete_sets_empty_ids_returns_400(client, in_memory_db, mock_nas):
    resp = client.request(
        "DELETE",
        "/api/admin/teaching-materials/sets/bulk-delete",
        json={"set_ids": []},
    )
    assert resp.status_code == 400
    assert "不可為空" in resp.json()["detail"]
