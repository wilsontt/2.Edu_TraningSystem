"""訓練計畫免考三層級單元測試。"""
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app import models
from app.constants.auth import SUPER_ADMIN_ROLE_NAMES
from app.services.exam_exemption import (
    apply_exam_exemptions,
    merge_exam_exempt_role_ids,
    resolve_assigned_emp_ids,
    resolve_checkin_expected_emp_ids,
    resolve_exam_required_emp_ids,
    user_is_exam_exempt,
    user_requires_checkin,
    user_requires_exam,
)


def _seed_plan_context(db: Session):
    dept_a = db.query(models.Department).filter_by(name="IT部").first()
    dept_b = models.Department(name="業務部")
    db.add(dept_b)
    db.flush()

    admin_role = db.query(models.Role).filter_by(name="Admin").first()
    user_role = db.query(models.Role).filter_by(name="User").first()
    mgr_role = models.Role(name="部門主管")
    db.add(mgr_role)
    db.flush()

    main = models.MainCategory(name="安衛")
    db.add(main)
    db.flush()
    sub = models.SubCategory(main_id=main.id, name="消防")
    db.add(sub)
    db.flush()

    trainee = models.User(
        emp_id="E001",
        name="學員甲",
        dept_id=dept_a.id,
        role_id=user_role.id,
        status="active",
        is_trainee=True,
    )
    mgr_user = models.User(
        emp_id="E002",
        name="主管乙",
        dept_id=dept_a.id,
        role_id=mgr_role.id,
        status="active",
        is_trainee=True,
    )
    admin_trainee = models.User(
        emp_id="E003",
        name="超管學員",
        dept_id=dept_a.id,
        role_id=admin_role.id,
        status="active",
        is_trainee=True,
    )
    other_dept_user = models.User(
        emp_id="E004",
        name="他部丙",
        dept_id=dept_b.id,
        role_id=user_role.id,
        status="active",
        is_trainee=True,
    )
    db.add_all([trainee, mgr_user, admin_trainee, other_dept_user])
    db.flush()

    plan = models.TrainingPlan(
        title="免考測試計畫",
        sub_category_id=sub.id,
        dept_id=dept_a.id,
        training_date=date.today(),
        year=str(date.today().year),
        passing_score=60,
    )
    plan.target_departments = [dept_a]
    db.add(plan)
    db.commit()
    db.refresh(plan)
    db.refresh(trainee)
    db.refresh(mgr_user)
    db.refresh(admin_trainee)
    db.refresh(other_dept_user)
    return {
        "plan": plan,
        "dept_a": dept_a,
        "dept_b": dept_b,
        "admin_role": admin_role,
        "user_role": user_role,
        "mgr_role": mgr_role,
        "trainee": trainee,
        "mgr_user": mgr_user,
        "admin_trainee": admin_trainee,
        "other_dept_user": other_dept_user,
    }


def test_merge_always_includes_super_admin_roles(in_memory_db: Session):
    admin = in_memory_db.query(models.Role).filter_by(name="Admin").first()
    sysadmin = in_memory_db.query(models.Role).filter_by(name="系統管理").first()
    merged = merge_exam_exempt_role_ids(in_memory_db, [])
    assert admin.id in merged
    assert sysadmin.id in merged
    # 試圖不傳超管仍會補上
    merged2 = merge_exam_exempt_role_ids(in_memory_db, [admin.id])
    assert set(SUPER_ADMIN_ROLE_NAMES).issuperset(
        {r.name for r in in_memory_db.query(models.Role).filter(models.Role.id.in_(merged2)).all()
         if r.name in SUPER_ADMIN_ROLE_NAMES}
    )


def test_role_exempt_requires_exam_false_but_checkin_true(in_memory_db: Session):
    ctx = _seed_plan_context(in_memory_db)
    plan = ctx["plan"]
    apply_exam_exemptions(
        in_memory_db,
        plan,
        role_ids=[ctx["mgr_role"].id],
        dept_ids=[],
        user_ids=[],
    )
    in_memory_db.commit()
    in_memory_db.refresh(plan)

    assert user_is_exam_exempt(ctx["mgr_user"], plan) is True
    assert user_requires_exam(ctx["mgr_user"], plan) is False
    assert user_requires_checkin(ctx["mgr_user"], plan) is True

    assert user_requires_exam(ctx["trainee"], plan) is True
    assert user_requires_checkin(ctx["trainee"], plan) is True


def test_personal_exempt(in_memory_db: Session):
    ctx = _seed_plan_context(in_memory_db)
    plan = ctx["plan"]
    apply_exam_exemptions(
        in_memory_db,
        plan,
        role_ids=[],
        dept_ids=[],
        user_ids=[ctx["trainee"].emp_id],
    )
    in_memory_db.commit()
    in_memory_db.refresh(plan)

    assert user_requires_exam(ctx["trainee"], plan) is False
    assert user_requires_checkin(ctx["trainee"], plan) is True


def test_super_admin_no_checkin_and_not_in_expected(in_memory_db: Session):
    ctx = _seed_plan_context(in_memory_db)
    plan = ctx["plan"]
    apply_exam_exemptions(in_memory_db, plan, role_ids=[], dept_ids=[], user_ids=[])
    in_memory_db.commit()
    in_memory_db.refresh(plan)

    assert user_requires_exam(ctx["admin_trainee"], plan) is False
    assert user_requires_checkin(ctx["admin_trainee"], plan) is False

    assigned = resolve_assigned_emp_ids(plan, in_memory_db)
    expected = resolve_checkin_expected_emp_ids(plan, in_memory_db)
    need_exam = resolve_exam_required_emp_ids(plan, in_memory_db)

    assert ctx["admin_trainee"].emp_id in assigned
    assert ctx["admin_trainee"].emp_id not in expected
    assert ctx["admin_trainee"].emp_id not in need_exam
    assert ctx["trainee"].emp_id in need_exam
    assert ctx["trainee"].emp_id in expected


def test_apply_rejects_unknown_role(in_memory_db: Session):
    ctx = _seed_plan_context(in_memory_db)
    with pytest.raises(ValueError, match="免考角色"):
        apply_exam_exemptions(
            in_memory_db,
            ctx["plan"],
            role_ids=[999999],
            dept_ids=[],
            user_ids=[],
        )


def test_create_plan_api_forces_super_admin_exempt(client, in_memory_db: Session):
    dept = in_memory_db.query(models.Department).first()
    main = models.MainCategory(name="主分類")
    in_memory_db.add(main)
    in_memory_db.flush()
    sub = models.SubCategory(main_id=main.id, name="細分類")
    in_memory_db.add(sub)
    in_memory_db.commit()

    # client fixture 的 get_current_user 是 admin，但 create 需 menu:plan
    from app.models import SystemFunction, role_functions

    admin_role = in_memory_db.query(models.Role).filter_by(name="Admin").first()
    func = models.SystemFunction(name="訓練計畫", code="menu:plan", path="/plans")
    in_memory_db.add(func)
    in_memory_db.flush()
    admin_role.functions.append(func)
    in_memory_db.commit()

    res = client.post(
        "/api/training/plans",
        json={
            "title": "API 免考計畫",
            "sub_category_id": sub.id,
            "dept_id": dept.id,
            "training_date": str(date.today()),
            "passing_score": 60,
            "target_dept_ids": [dept.id],
            "exam_exempt_role_ids": [],
            "exam_exempt_dept_ids": [],
            "exam_exempt_user_ids": [],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    exempt_names = {r["name"] for r in body["exam_exempt_roles"]}
    assert "Admin" in exempt_names
    assert "系統管理" in exempt_names

    # 試圖 update 移除超管 → 仍保留
    plan_id = body["id"]
    res2 = client.put(
        f"/api/training/plans/{plan_id}",
        json={
            "title": "API 免考計畫",
            "sub_category_id": sub.id,
            "dept_id": dept.id,
            "training_date": str(date.today()),
            "passing_score": 60,
            "target_dept_ids": [dept.id],
            "exam_exempt_role_ids": [],
            "exam_exempt_dept_ids": [],
            "exam_exempt_user_ids": [],
        },
    )
    assert res2.status_code == 200, res2.text
    names2 = {r["name"] for r in res2.json()["exam_exempt_roles"]}
    assert "Admin" in names2
