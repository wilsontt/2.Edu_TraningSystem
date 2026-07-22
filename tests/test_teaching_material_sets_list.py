"""教材套組列表／搜尋／詳情測試（含綁定計畫名稱 keyword 搜尋）。"""
import io

from app.models import MaterialType, MaterialFileFormat, Department, TrainingPlan


def _seed_type_and_format(db):
    mt = MaterialType(name="操作手冊", slug="opm", sort_order=1, is_active=True)
    db.add(mt)
    fmt = MaterialFileFormat(ext="pdf", label="PDF", is_active=True)
    db.add(fmt)
    db.commit()
    return mt


def _create_set(client, db, mt_id, title, plan_ids=None, filename="a.pdf"):
    dept = db.query(Department).filter(Department.name == "IT部").first()
    data = {"title": title, "material_type_id": str(mt_id), "dept_id": str(dept.id)}
    if plan_ids:
        data["plan_ids"] = ",".join(str(p) for p in plan_ids)
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data=data,
        files=[("files", (filename, io.BytesIO(b"content"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_list_sets_returns_file_count_and_general_when_no_plan(client, in_memory_db, mock_nas):
    mt = _seed_type_and_format(in_memory_db)
    _create_set(client, in_memory_db, mt.id, "通用教材")

    resp = client.get("/api/admin/teaching-materials/sets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["file_count"] == 1
    assert body["items"][0]["plan_titles"] == []


def test_search_by_bound_plan_title(client, in_memory_db, mock_nas):
    mt = _seed_type_and_format(in_memory_db)
    it_dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    plan = TrainingPlan(title="112年度消防安全講習", dept_id=it_dept.id, year="2026")
    in_memory_db.add(plan)
    in_memory_db.commit()

    _create_set(client, in_memory_db, mt.id, "講義", plan_ids=[plan.id])
    _create_set(client, in_memory_db, mt.id, "無關教材")

    resp = client.get("/api/admin/teaching-materials/sets", params={"keyword": "消防安全"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "講義"
    assert body["items"][0]["plan_titles"] == ["112年度消防安全講習"]


def test_get_set_detail_includes_files(client, in_memory_db, mock_nas):
    mt = _seed_type_and_format(in_memory_db)
    created = _create_set(client, in_memory_db, mt.id, "詳情測試")

    resp = client.get(f"/api/admin/teaching-materials/sets/{created['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["files"]) == 1
    assert body["files"][0]["original_filename"] == "a.pdf"


def test_get_set_detail_404_when_not_found(client, in_memory_db):
    resp = client.get("/api/admin/teaching-materials/sets/9999")
    assert resp.status_code == 404
