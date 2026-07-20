"""考卷工坊 list_materials：NAS 不可達時回 200 空陣列＋標頭，不中斷選計畫。"""
from datetime import date, timedelta
from unittest.mock import MagicMock

from app.models import MainCategory, SubCategory, TrainingPlan, Department
from app.services import storage


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


def test_list_materials_nas_unavailable_returns_empty_200(client, in_memory_db, monkeypatch):
    plan_id = _seed_plan(in_memory_db)

    def _boom(_creds):
        raise storage.StorageUnavailable("NAS offline for test")

    monkeypatch.setattr(storage, "service_credentials", lambda: MagicMock())
    monkeypatch.setattr(storage, "connection", _boom)

    resp = client.get(f"/api/admin/exams/materials/{plan_id}")
    assert resp.status_code == 200
    assert resp.json() == []
    assert resp.headers.get("x-nas-unavailable") == "1"
