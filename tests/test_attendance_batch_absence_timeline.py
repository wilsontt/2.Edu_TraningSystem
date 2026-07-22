"""批次層未到原因、歷程時間軸、合併報到紀錄列表。"""
from datetime import date, timedelta

from app.models import (
    AttendanceAbsenceReason,
    AttendanceBatchAbsenceReason,
    AttendanceCheckinEvent,
    AttendanceRecord,
    Department,
    MainCategory,
    Role,
    SubCategory,
    SystemFunction,
    TrainingPlan,
    User,
)
from app.routers.auth import get_current_user


def _seed_plans_with_targets(db, n: int = 2, suffix: str = "abs"):
    training_date = date.today()
    dept = db.query(Department).filter(Department.name == "IT部").first()
    main = MainCategory(name=f"未到原因大類-{suffix}")
    db.add(main)
    db.flush()
    sub = SubCategory(main_id=main.id, name=f"未到原因細類-{suffix}")
    db.add(sub)
    db.flush()
    plans = []
    for i in range(n):
        p = TrainingPlan(
            title=f"未到場次{suffix}-{i+1}",
            sub_category_id=sub.id,
            dept_id=dept.id,
            training_date=training_date,
            end_date=training_date + timedelta(days=7),
            year=str(training_date.year),
            passing_score=60,
            is_archived=False,
        )
        db.add(p)
        plans.append(p)
    db.commit()
    for p in plans:
        db.refresh(p)
    return dept, plans


def _ensure_overview_user(db, emp_id: str, dept_id: int) -> User:
    overview_role = db.query(Role).filter(Role.name == "報到總覽測試角色").first()
    if not overview_role:
        overview_role = Role(name="報到總覽測試角色")
        db.add(overview_role)
        db.flush()
        codes = [
            ("報到總覽", "menu:attendance-overview", "/attendance-overview"),
            ("訓練計畫", "menu:plan", "/admin/plans"),
        ]
        for name, code, path in codes:
            fn = db.query(SystemFunction).filter(SystemFunction.code == code).first()
            if not fn:
                fn = SystemFunction(name=name, code=code, path=path)
                db.add(fn)
                db.flush()
            if fn not in overview_role.functions:
                overview_role.functions.append(fn)
        db.commit()
        db.refresh(overview_role)
    else:
        # 既有角色補齊 menu:plan（stats 全域可視）
        fn_plan = db.query(SystemFunction).filter(SystemFunction.code == "menu:plan").first()
        if not fn_plan:
            fn_plan = SystemFunction(name="訓練計畫", code="menu:plan", path="/admin/plans")
            db.add(fn_plan)
            db.flush()
        if fn_plan not in overview_role.functions:
            overview_role.functions.append(fn_plan)
            db.commit()
            db.refresh(overview_role)

    user = User(
        emp_id=emp_id,
        name="報到總覽員",
        dept_id=dept_id,
        role_id=overview_role.id,
        status="active",
        is_trainee=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_batch_absence_apply_and_plan_override(client, in_memory_db):
    from app.main import app

    dept, plans = _seed_plans_with_targets(in_memory_db, n=2, suffix="bo")
    overview = _ensure_overview_user(in_memory_db, "ov-abs-1", dept.id)
    trainee = User(
        emp_id="trainee-abs-1",
        name="未到學員",
        dept_id=dept.id,
        status="active",
        is_trainee=True,
    )
    in_memory_db.add(trainee)
    in_memory_db.commit()
    in_memory_db.refresh(trainee)

    for p in plans:
        p.target_users.append(trainee)
    in_memory_db.commit()
    for p in plans:
        in_memory_db.refresh(p)

    app.dependency_overrides[get_current_user] = lambda: overview
    try:
        create = client.post(
            "/api/training/attendance/batches",
            json={"plan_ids": [p.id for p in plans], "label": "0721 上午場"},
        )
        assert create.status_code == 200, create.text
        batch_id = create.json()["id"]

        # 關閉後仍可填原因
        closed = client.patch(
            f"/api/training/attendance/batches/{batch_id}/status",
            json={"status": "closed"},
        )
        assert closed.status_code == 200

        put = client.put(
            f"/api/training/attendance/batches/{batch_id}/absence-reason",
            json={"emp_id": trainee.emp_id, "reason_code": "sick_leave"},
        )
        assert put.status_code == 200, put.text
        assert put.json()["applied_plan_count"] == 2

        for p in plans:
            row = (
                in_memory_db.query(AttendanceAbsenceReason)
                .filter_by(plan_id=p.id, emp_id=trainee.emp_id)
                .first()
            )
            assert row is not None
            assert row.reason_code == "sick_leave"

        batch_row = (
            in_memory_db.query(AttendanceBatchAbsenceReason)
            .filter_by(batch_id=batch_id, emp_id=trainee.emp_id)
            .first()
        )
        assert batch_row is not None
        assert batch_row.reason_code == "sick_leave"

        events = (
            in_memory_db.query(AttendanceCheckinEvent)
            .filter_by(emp_id=trainee.emp_id, event_type="absence_reason_updated")
            .all()
        )
        assert len(events) == 2

        # plan override
        ov = client.put(
            f"/api/training/plans/{plans[0].id}/attendance/absence-reason",
            json={"emp_id": trainee.emp_id, "reason_code": "official_leave"},
        )
        assert ov.status_code == 200, ov.text

        stats_a = client.get(f"/api/training/plans/{plans[0].id}/attendance/stats")
        assert stats_a.status_code == 200
        absent_a = stats_a.json()["not_checked_in_users"]
        me_a = next(u for u in absent_a if u["emp_id"] == trainee.emp_id)
        assert me_a["absence_reason_code"] == "official_leave"
        assert me_a.get("is_plan_override") is True

        stats_b = client.get(f"/api/training/plans/{plans[1].id}/attendance/stats")
        me_b = next(u for u in stats_b.json()["not_checked_in_users"] if u["emp_id"] == trainee.emp_id)
        assert me_b["absence_reason_code"] == "sick_leave"
        assert me_b.get("is_plan_override") is False

        # 歷程降冪：最新在前
        hist = client.get(
            f"/api/training/plans/{plans[0].id}/attendance/events",
            params={"emp_id": trainee.emp_id},
        )
        assert hist.status_code == 200
        evs = hist.json()
        assert len(evs) >= 2
        assert evs[0]["event_type"] == "absence_reason_updated"
        assert evs[0]["reason_code"] == "official_leave"
        assert "公假" in (evs[0].get("display_label") or "")

        # 列表可搜尋
        listed = client.get(
            "/api/training/attendance/batches",
            params={"keyword": "0721"},
        )
        assert listed.status_code == 200
        assert any(x["id"] == batch_id for x in listed.json())
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin


def test_batch_absence_skips_checked_in(client, in_memory_db):
    from app.main import app

    dept, plans = _seed_plans_with_targets(in_memory_db, n=2, suffix="skip")
    overview = _ensure_overview_user(in_memory_db, "ov-abs-2", dept.id)
    trainee = User(
        emp_id="trainee-abs-2",
        name="已報到學員",
        dept_id=dept.id,
        status="active",
        is_trainee=True,
    )
    in_memory_db.add(trainee)
    in_memory_db.commit()
    for p in plans:
        p.target_users.append(trainee)
    # 僅第一場已報到
    in_memory_db.add(
        AttendanceRecord(plan_id=plans[0].id, emp_id=trainee.emp_id)
    )
    in_memory_db.commit()
    for p in plans:
        in_memory_db.refresh(p)

    app.dependency_overrides[get_current_user] = lambda: overview
    try:
        create = client.post(
            "/api/training/attendance/batches",
            json={"plan_ids": [p.id for p in plans], "label": "部分已到"},
        )
        batch_id = create.json()["id"]
        put = client.put(
            f"/api/training/attendance/batches/{batch_id}/absence-reason",
            json={"emp_id": trainee.emp_id, "reason_code": "business_trip"},
        )
        assert put.status_code == 200, put.text
        assert put.json()["applied_plan_count"] == 1
        assert (
            in_memory_db.query(AttendanceAbsenceReason)
            .filter_by(plan_id=plans[0].id, emp_id=trainee.emp_id)
            .first()
            is None
        )
        assert (
            in_memory_db.query(AttendanceAbsenceReason)
            .filter_by(plan_id=plans[1].id, emp_id=trainee.emp_id)
            .first()
            is not None
        )
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin
