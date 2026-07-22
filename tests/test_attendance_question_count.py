"""報到 status／checkin 回傳 question_count／has_exam。"""
from datetime import date, timedelta

from app.models import (
    Department,
    MainCategory,
    Question,
    SubCategory,
    TrainingPlan,
    User,
)
from app.routers.auth import get_current_user


def _seed_plan(db, *, with_question: bool):
    dept = db.query(Department).filter(Department.name == "IT部").first()
    user = User(
        emp_id="900101",
        name="考題計數測試員",
        dept_id=dept.id,
        status="active",
        is_trainee=True,
    )
    db.add(user)

    main = MainCategory(name="考題計數大類")
    db.add(main)
    db.flush()
    sub = SubCategory(main_id=main.id, name="考題計數細類")
    db.add(sub)
    db.flush()

    plan = TrainingPlan(
        title="考題計數測試計畫",
        sub_category_id=sub.id,
        dept_id=dept.id,
        training_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=7),
        year=str(date.today().year),
        timer_enabled=False,
        time_limit=60,
        passing_score=60,
    )
    db.add(plan)
    db.flush()

    if with_question:
        db.add(
            Question(
                plan_id=plan.id,
                content="測試題？",
                question_type="true_false",
                options='["是", "否"]',
                answer="是",
                points=10,
            )
        )
        db.flush()

    db.commit()
    return user, plan


def test_attendance_status_has_exam_true(client, in_memory_db):
    from app.main import app

    user, plan = _seed_plan(in_memory_db, with_question=True)

    def _override():
        return user

    app.dependency_overrides[get_current_user] = _override
    try:
        res = client.get(f"/api/exam/plan/{plan.id}/attendance/status")
        assert res.status_code == 200
        body = res.json()
        assert body["question_count"] == 1
        assert body["has_exam"] is True
        assert body["plan_title"] == plan.title
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_attendance_status_has_exam_false(client, in_memory_db):
    from app.main import app

    user, plan = _seed_plan(in_memory_db, with_question=False)

    def _override():
        return user

    app.dependency_overrides[get_current_user] = _override
    try:
        res = client.get(f"/api/exam/plan/{plan.id}/attendance/status")
        assert res.status_code == 200
        body = res.json()
        assert body["question_count"] == 0
        assert body["has_exam"] is False

        checkin = client.post(f"/api/exam/plan/{plan.id}/attendance/checkin")
        assert checkin.status_code == 200
        cbody = checkin.json()
        assert cbody["question_count"] == 0
        assert cbody["has_exam"] is False
        assert cbody["success"] is True
    finally:
        app.dependency_overrides.pop(get_current_user, None)
