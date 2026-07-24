"""考卷工坊 materials 端點已退役：回 410 Gone。"""
from datetime import date, timedelta

from app.models import MainCategory, SubCategory, TrainingPlan, Department


def _seed_plan(db) -> int:
    dept = db.query(Department).filter(Department.name == "IT部").first()
    main = MainCategory(name="考卷NAS測試大類")
    db.add(main)
    db.flush()
    sub = SubCategory(main_id=main.id, name="考卷NAS測試細類")
    db.add(sub)
    db.flush()
    plan = TrainingPlan(
        title="NAS list 測試計畫",
        sub_category_id=sub.id,
        dept_id=dept.id,
        training_date=date.today(),
        end_date=date.today() + timedelta(days=7),
        year=str(date.today().year),
        passing_score=60,
        is_archived=False,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan.id


def test_list_materials_gone(client, in_memory_db):
    plan_id = _seed_plan(in_memory_db)
    resp = client.get(f"/api/admin/exams/materials/{plan_id}")
    assert resp.status_code == 410
    assert "退役" in resp.json()["detail"]


def test_preview_material_gone(client, in_memory_db):
    plan_id = _seed_plan(in_memory_db)
    year = date.today().year
    resp = client.get(f"/api/admin/exams/materials/preview/{year}/{plan_id}/sample.txt")
    assert resp.status_code == 410


def test_delete_material_gone(client, in_memory_db):
    plan_id = _seed_plan(in_memory_db)
    resp = client.delete(f"/api/admin/exams/materials/{plan_id}/sample.txt")
    assert resp.status_code == 410
