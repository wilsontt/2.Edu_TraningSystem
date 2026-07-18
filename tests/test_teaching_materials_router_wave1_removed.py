"""確認 Wave1 舊端點已移除，且教材類型/格式刪除檢查涵蓋 Wave2 套組。"""
import io

from app.models import MaterialType, MaterialFileFormat, Department


def test_wave1_endpoints_are_gone(client):
    assert client.get("/api/admin/teaching-materials/conflict-check", params={"original_filename": "a.pdf"}).status_code == 404
    assert client.post("/api/admin/teaching-materials/upload").status_code == 404
    assert client.get("/api/admin/teaching-materials/by-plan/1").status_code == 404
    assert client.get("/api/admin/teaching-materials/").status_code == 404
    assert client.get("/api/admin/teaching-materials/1/download").status_code == 404
    # Wave2 仍保留 POST /batch-download（file_ids）；Wave1 的 ids 語意已失效
    r = client.post("/api/admin/teaching-materials/batch-download", json={"ids": [1]})
    assert r.status_code == 422
    assert client.put("/api/admin/teaching-materials/1", json={}).status_code == 404
    assert client.post("/api/admin/teaching-materials/1/replace-file").status_code == 404
    assert client.delete("/api/admin/teaching-materials/1").status_code == 404


def test_material_type_delete_blocked_when_used_by_wave2_set(client, in_memory_db, mock_nas):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    in_memory_db.add(mt)
    in_memory_db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    in_memory_db.commit()
    dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "套組", "material_type_id": str(mt.id), "dept_id": str(dept.id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text

    resp = client.delete(f"/api/admin/teaching-materials/material-types/{mt.id}")
    assert resp.status_code == 200
    assert resp.json()["disabled"] is True  # 改為停用，而非硬刪


def test_material_type_delete_succeeds_when_unused(client, in_memory_db):
    mt = MaterialType(name="未使用類型", slug="unused", is_active=True)
    in_memory_db.add(mt)
    in_memory_db.commit()

    resp = client.delete(f"/api/admin/teaching-materials/material-types/{mt.id}")
    assert resp.status_code == 200
    assert resp.json()["message"] == "已刪除"
