"""套組中繼資料更新、計畫綁定切換、軟刪除測試（教材 PLAN §5.12.8 S6/S7/S8）。"""
import io

from app.models import MaterialType, MaterialFileFormat, Department, TrainingPlan


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set(client, db, mt_id, title="通用教材"):
    dept = db.query(Department).filter(Department.name == "IT部").first()
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": title, "material_type_id": str(mt_id), "dept_id": str(dept.id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_plans(db, names):
    it_dept = db.query(Department).filter(Department.name == "IT部").first()
    plans = [TrainingPlan(title=n, dept_id=it_dept.id, year="2026") for n in names]
    db.add_all(plans)
    db.commit()
    return plans


def test_update_metadata(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, in_memory_db, mt.id)

    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}",
        json={"title": "新標題", "tags": ["安全", "消防"]},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "新標題"


def test_bind_then_unbind_plan_toggles_general_flag(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, in_memory_db, mt.id)
    plan_a, plan_b = _make_plans(in_memory_db, ["計畫A", "計畫B"])

    # S6：通用套組綁定計畫 A → 顯示計畫 A 名稱
    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}/plans",
        json={"plan_ids": [plan_a.id]},
    )
    assert resp.status_code == 200
    assert resp.json()["plan_titles"] == ["計畫A"]

    # S7：再綁計畫 B → 兩者皆可見
    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}/plans",
        json={"plan_ids": [plan_a.id, plan_b.id]},
    )
    assert sorted(resp.json()["plan_titles"]) == ["計畫A", "計畫B"]

    # S8：解除全部綁定 → 恢復「通用」（plan_titles 為空陣列）
    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}/plans",
        json={"plan_ids": []},
    )
    assert resp.json()["plan_titles"] == []


def test_delete_set_soft_deletes(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, in_memory_db, mt.id)

    resp = client.delete(f"/api/admin/teaching-materials/sets/{created['id']}")
    assert resp.status_code == 200

    resp = client.get(f"/api/admin/teaching-materials/sets/{created['id']}")
    assert resp.status_code == 404  # 軟刪後列表/詳情皆視為不存在

    resp = client.get("/api/admin/teaching-materials/sets")
    assert resp.json()["total"] == 0
