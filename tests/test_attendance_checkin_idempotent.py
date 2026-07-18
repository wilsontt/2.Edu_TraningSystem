"""報到 checkin 冪等與 UNIQUE(emp_id, plan_id) 行為。"""
from datetime import date, timedelta

from app.models import (
    AttendanceRecord,
    Department,
    MainCategory,
    SubCategory,
    TrainingPlan,
    User,
)
from app.routers.auth import get_current_user


def test_checkin_is_idempotent(client, in_memory_db):
    """同一人同一計畫連續 checkin 兩次皆 200，且 DB 僅一列。"""
    from app.main import app

    dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    user = User(
        emp_id="900001",
        name="報到測試員",
        dept_id=dept.id,
        status="active",
        is_trainee=True,
    )
    in_memory_db.add(user)

    main = MainCategory(name="報到測試大類")
    in_memory_db.add(main)
    in_memory_db.flush()
    sub = SubCategory(main_id=main.id, name="報到測試細類")
    in_memory_db.add(sub)
    in_memory_db.flush()

    plan = TrainingPlan(
        title="報到冪等測試計畫",
        sub_category_id=sub.id,
        dept_id=dept.id,
        training_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=7),
        year=str(date.today().year),
        passing_score=60,
        is_archived=False,
    )
    in_memory_db.add(plan)
    in_memory_db.commit()
    in_memory_db.refresh(user)
    in_memory_db.refresh(plan)

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        r1 = client.post(f"/api/exam/plan/{plan.id}/attendance/checkin")
        assert r1.status_code == 200, r1.text
        r2 = client.post(f"/api/exam/plan/{plan.id}/attendance/checkin")
        assert r2.status_code == 200, r2.text
        assert r1.json()["success"] is True
        assert r2.json()["success"] is True
        assert r1.json().get("plan_title") == plan.title
        assert r2.json().get("plan_title") == plan.title

        rows = (
            in_memory_db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.emp_id == user.emp_id,
                AttendanceRecord.plan_id == plan.id,
            )
            .all()
        )
        assert len(rows) == 1
    finally:
        # 還原 client fixture 的 admin override
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin
