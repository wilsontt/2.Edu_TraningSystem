"""檔案檢視列表／單檔下載／批次 ZIP 下載測試（教材 PLAN §5.12.8 S11）。"""
import io
import zipfile

from app.models import MaterialType, MaterialFileFormat


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set(client, mt_id, title="套組"):
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": title, "material_type_id": str(mt_id)},
        files=[("files", ("a.pdf", io.BytesIO(b"hello-a"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_file_view_matches_set_view_count(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    _create_set(client, mt.id)

    sets_resp = client.get("/api/admin/teaching-materials/sets").json()
    files_resp = client.get("/api/admin/teaching-materials/files").json()

    assert files_resp["total"] == sets_resp["items"][0]["file_count"] == 1  # S11：兩檢視資料一致
    assert files_resp["items"][0]["set_title"] == "套組"


def test_single_file_download(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    file_id = created["files"][0]["id"]

    resp = client.get(f"/api/admin/teaching-materials/files/{file_id}/download")
    assert resp.status_code == 200
    assert resp.content == b"hello-a"
    assert "a.pdf" in resp.headers["content-disposition"]


def test_batch_download_zip_contains_all_files(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        files=[("files", ("b.pdf", io.BytesIO(b"hello-b"), "application/pdf"))],
    )
    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    file_ids = [f["id"] for f in detail["files"]]

    resp = client.post(
        "/api/admin/teaching-materials/batch-download",
        json={"file_ids": file_ids},
    )
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert sorted(zf.namelist()) == ["a.pdf", "b.pdf"]
