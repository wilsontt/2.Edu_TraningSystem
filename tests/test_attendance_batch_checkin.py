"""合併報到批次、報到歷程、報到總覽 QR 權限。"""
from datetime import date, timedelta

from app.models import (
    AttendanceCheckinBatch,
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


def _seed_active_plans(db, n: int = 3, training_date: date | None = None, suffix: str = ""):
    training_date = training_date or date.today()
    dept = db.query(Department).filter(Department.name == "IT部").first()
    tag = suffix or f"{training_date.isoformat()}-{n}"
    main = MainCategory(name=f"合併報到大類-{tag}")
    db.add(main)
    db.flush()
    sub = SubCategory(main_id=main.id, name=f"合併報到細類-{tag}")
    db.add(sub)
    db.flush()
    plans = []
    for i in range(n):
        p = TrainingPlan(
            title=f"合併場次{tag}-{i+1}",
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
        fn = db.query(SystemFunction).filter(SystemFunction.code == "menu:attendance-overview").first()
        if not fn:
            fn = SystemFunction(name="報到總覽", code="menu:attendance-overview", path="/attendance-overview")
            db.add(fn)
            db.flush()
        overview_role.functions.append(fn)
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


def test_create_batch_requires_two_plans(client, in_memory_db):
    from app.main import app

    dept, plans = _seed_active_plans(in_memory_db, n=1, suffix="one")
    user = _ensure_overview_user(in_memory_db, "ov-1", dept.id)
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        r = client.post(
            "/api/training/attendance/batches",
            json={"plan_ids": [plans[0].id], "label": "測試標籤"},
        )
        assert r.status_code == 400
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin


def test_create_batch_allows_different_start_dates(client, in_memory_db):
    """不同開始日的進行中計畫可合併；批次 training_date 為場次日。"""
    from app.main import app

    dept, plans_a = _seed_active_plans(in_memory_db, n=1, training_date=date.today(), suffix="a")
    _, plans_b = _seed_active_plans(
        in_memory_db, n=1, training_date=date.today() - timedelta(days=1), suffix="b"
    )
    user = _ensure_overview_user(in_memory_db, "ov-2", dept.id)
    session_day = date.today()
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        r = client.post(
            "/api/training/attendance/batches",
            json={
                "plan_ids": [plans_a[0].id, plans_b[0].id],
                "label": "跨開始日合併",
                "training_date": session_day.isoformat(),
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["training_date"] == session_day.isoformat()
        assert len(body["plans"]) == 2
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin


def test_batch_checkin_and_close(client, in_memory_db):
    from app.main import app

    dept, plans = _seed_active_plans(in_memory_db, n=3, suffix="batch")
    overview = _ensure_overview_user(in_memory_db, "ov-3", dept.id)
    trainee = User(
        emp_id="trainee-batch",
        name="學員甲",
        dept_id=dept.id,
        status="active",
        is_trainee=True,
    )
    in_memory_db.add(trainee)
    in_memory_db.commit()
    in_memory_db.refresh(trainee)

    app.dependency_overrides[get_current_user] = lambda: overview
    try:
        create = client.post(
            "/api/training/attendance/batches",
            json={"plan_ids": [p.id for p in plans], "label": "上午合併"},
            headers={"X-Frontend-URL": "http://test/training"},
        )
        assert create.status_code == 200, create.text
        batch = create.json()
        assert batch["status"] == "open"
        assert len(batch["plans"]) == 3
        assert "batch_id=" in batch["checkin_url"]
        batch_id = batch["id"]

        app.dependency_overrides[get_current_user] = lambda: trainee
        cin = client.post(f"/api/exam/attendance/batches/{batch_id}/checkin")
        assert cin.status_code == 200, cin.text
        body = cin.json()
        assert body.get("checked_in_user", {}).get("emp_id") == "trainee-batch"
        assert body.get("checked_in_user", {}).get("name") == "學員甲"
        assert len(body["succeeded"]) == 3
        assert len(body["skipped"]) == 0

        rows = (
            in_memory_db.query(AttendanceRecord)
            .filter(AttendanceRecord.emp_id == trainee.emp_id)
            .all()
        )
        assert len(rows) == 3
        times = {r.checkin_time for r in rows}
        assert len(times) == 1

        events = (
            in_memory_db.query(AttendanceCheckinEvent)
            .filter(AttendanceCheckinEvent.emp_id == trainee.emp_id)
            .all()
        )
        assert len(events) == 3
        assert all(e.result == "success" for e in events)

        # 第二次掃 → already_checked
        cin2 = client.post(f"/api/exam/attendance/batches/{batch_id}/checkin")
        assert cin2.status_code == 200
        assert len(cin2.json()["succeeded"]) == 0
        assert all(s["result"] == "already_checked" for s in cin2.json()["skipped"])
        assert in_memory_db.query(AttendanceRecord).filter(
            AttendanceRecord.emp_id == trainee.emp_id
        ).count() == 3

        app.dependency_overrides[get_current_user] = lambda: overview
        closed = client.patch(
            f"/api/training/attendance/batches/{batch_id}/status",
            json={"status": "closed"},
        )
        assert closed.status_code == 200
        assert closed.json()["status"] == "closed"

        app.dependency_overrides[get_current_user] = lambda: trainee
        blocked = client.post(f"/api/exam/attendance/batches/{batch_id}/checkin")
        assert blocked.status_code == 400

        app.dependency_overrides[get_current_user] = lambda: overview
        # 歷程 API 應帶合併報到標籤
        events_api = client.get(
            f"/api/training/plans/{plans[0].id}/attendance/events",
            params={"emp_id": trainee.emp_id},
        )
        assert events_api.status_code == 200
        event_rows = events_api.json()
        assert len(event_rows) >= 1
        assert event_rows[0]["batch_label"] == "上午合併"
        assert event_rows[0]["result"] == "success"

        reopened = client.patch(
            f"/api/training/attendance/batches/{batch_id}/status",
            json={"status": "reopened"},
        )
        assert reopened.status_code == 200
        assert reopened.json()["status"] == "reopened"
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin


def test_batch_create_requires_label(client, in_memory_db):
    from app.main import app

    dept, plans = _seed_active_plans(in_memory_db, n=2, suffix="label")
    overview = _ensure_overview_user(in_memory_db, "ov-label", dept.id)
    app.dependency_overrides[get_current_user] = lambda: overview
    try:
        missing = client.post(
            "/api/training/attendance/batches",
            json={"plan_ids": [plans[0].id, plans[1].id]},
        )
        assert missing.status_code == 422

        too_short = client.post(
            "/api/training/attendance/batches",
            json={"plan_ids": [plans[0].id, plans[1].id], "label": "A"},
        )
        assert too_short.status_code == 422
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin


def test_overview_qr_without_owner(client, in_memory_db):
    """有 menu:attendance-overview 即可產生單計畫 QR，不需 Owner。"""
    from app.main import app

    sales = in_memory_db.query(Department).filter(Department.name == "業務部").first()
    if not sales:
        sales = Department(name="業務部")
        in_memory_db.add(sales)
        in_memory_db.commit()
        in_memory_db.refresh(sales)

    _, plans = _seed_active_plans(in_memory_db, n=1, suffix="qr")
    # 計畫開課單位 = IT；使用者屬業務部但有報到總覽權限
    overview = _ensure_overview_user(in_memory_db, "ov-sales", sales.id)
    app.dependency_overrides[get_current_user] = lambda: overview
    try:
        r = client.post(
            f"/api/training/plans/{plans[0].id}/checkin-qrcode/generate",
            headers={"X-Frontend-URL": "http://test/training"},
        )
        assert r.status_code == 200, r.text
        assert "checkin_url" in r.json()
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin


def test_single_checkin_writes_events(client, in_memory_db):
    from app.main import app

    dept, plans = _seed_active_plans(in_memory_db, n=1, suffix="single")
    trainee = User(
        emp_id="trainee-single",
        name="學員乙",
        dept_id=dept.id,
        status="active",
        is_trainee=True,
    )
    in_memory_db.add(trainee)
    in_memory_db.commit()
    in_memory_db.refresh(trainee)

    app.dependency_overrides[get_current_user] = lambda: trainee
    try:
        r1 = client.post(f"/api/exam/plan/{plans[0].id}/attendance/checkin")
        assert r1.status_code == 200
        r2 = client.post(f"/api/exam/plan/{plans[0].id}/attendance/checkin")
        assert r2.status_code == 200
        events = (
            in_memory_db.query(AttendanceCheckinEvent)
            .filter(AttendanceCheckinEvent.emp_id == trainee.emp_id)
            .order_by(AttendanceCheckinEvent.id.asc())
            .all()
        )
        assert len(events) == 2
        assert events[0].result == "success"
        assert events[1].result == "already_checked"

        # events API
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin
        listed = client.get(
            f"/api/training/plans/{plans[0].id}/attendance/events",
            params={"emp_id": trainee.emp_id},
        )
        assert listed.status_code == 200
        assert len(listed.json()) == 2
    finally:
        admin = in_memory_db.query(User).filter(User.emp_id == "test-admin").first()
        app.dependency_overrides[get_current_user] = lambda: admin
