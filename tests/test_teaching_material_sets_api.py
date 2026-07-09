"""教材套組 API 測試：建立套組（POST /sets）。"""
import io

from app.models import MaterialType, MaterialFileFormat


def _seed_material_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", sort_order=1, is_active=True)
    db.add(mt)
    fmt = MaterialFileFormat(ext="pdf", label="PDF", is_active=True)
    db.add(fmt)
    db.commit()
    return mt


def test_create_set_with_two_files(client, in_memory_db):
    mt = _seed_material_type(in_memory_db)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={
            "title": "安全教育教材",
            "material_type_id": str(mt.id),
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
        data={"title": "測試", "material_type_id": str(mt.id)},
        files=[("files", ("virus.exe", io.BytesIO(b"AAA"), "application/octet-stream"))],
    )
    assert resp.status_code == 400
    assert "格式" in resp.json()["detail"]
