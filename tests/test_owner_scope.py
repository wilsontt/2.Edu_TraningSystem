"""Owner（開課單位）刪除限制與 dept_id 篩選測試（20260717 報到/擁有權新需求）。"""
import io

from app.access_scope import can_delete_owned_resource
from app.models import (
    Department, MaterialType, MaterialFileFormat, QuestionBank, Role,
    SystemFunction, TrainingPlan, User,
)


# ----------------------------------------------------------------
# can_delete_owned_resource() 純函式測試
# ----------------------------------------------------------------

def _fake_user(role_name, dept_id):
    role = Role(name=role_name)
    user = User(emp_id="fake", name="fake", dept_id=dept_id, status="active", is_trainee=True)
    user.role = role
    return user


def test_resource_dept_none_always_allowed():
    user = _fake_user("User", dept_id=1)
    assert can_delete_owned_resource(user, None) is True


def test_management_role_always_allowed():
    user = _fake_user("系統管理", dept_id=1)
    assert can_delete_owned_resource(user, 999) is True


def test_matching_dept_allowed():
    user = _fake_user("User", dept_id=5)
    assert can_delete_owned_resource(user, 5) is True


def test_mismatched_dept_denied():
    user = _fake_user("User", dept_id=5)
    assert can_delete_owned_resource(user, 6) is False


# ----------------------------------------------------------------
# API 層：dept_id 篩選（管理者 client，不受 owner 限制影響）
# ----------------------------------------------------------------

def _make_second_dept(db) -> Department:
    dept = Department(name="業務部")
    db.add(dept)
    db.commit()
    return dept


def test_question_bank_dept_id_filter(client, in_memory_db):
    it_dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    sales_dept = _make_second_dept(in_memory_db)
    in_memory_db.add_all([
        QuestionBank(content="Q1", question_type="single", answer="A", dept_id=it_dept.id),
        QuestionBank(content="Q2", question_type="single", answer="A", dept_id=sales_dept.id),
    ])
    in_memory_db.commit()

    resp = client.get("/api/admin/question-bank/", params={"dept_id": it_dept.id})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["content"] == "Q1"
    assert body["items"][0]["dept_name"] == "IT部"


def test_material_sets_dept_id_filter(client, in_memory_db, mock_nas):
    it_dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    sales_dept = _make_second_dept(in_memory_db)
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    in_memory_db.add(mt)
    in_memory_db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    in_memory_db.commit()

    client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "IT套組", "material_type_id": str(mt.id), "dept_id": str(it_dept.id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "業務套組", "material_type_id": str(mt.id), "dept_id": str(sales_dept.id)},
        files=[("files", ("b.pdf", io.BytesIO(b"y"), "application/pdf"))],
    )

    resp = client.get("/api/admin/teaching-materials/sets", params={"dept_id": sales_dept.id})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "業務套組"
    assert body["items"][0]["dept_name"] == "業務部"


# ----------------------------------------------------------------
# API 層：owner 檢查（非開課單位帳號應被拒絕；超管/開課單位帳號可刪除）
# ----------------------------------------------------------------

def _grant_function(db, role: Role, code: str) -> None:
    func = db.query(SystemFunction).filter(SystemFunction.code == code).first()
    if not func:
        func = SystemFunction(name=code, code=code)
        db.add(func)
        db.commit()
    role.functions.append(func)
    db.commit()


def _switch_current_user(user):
    from app.main import app
    from app.routers.auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: user


def test_delete_training_plan_denied_for_non_owner_dept(client, in_memory_db):
    it_dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    sales_dept = _make_second_dept(in_memory_db)
    user_role = in_memory_db.query(Role).filter(Role.name == "User").first()
    _grant_function(in_memory_db, user_role, "menu:plan")

    non_owner = User(
        emp_id="non-owner", name="非開課單位", role_id=user_role.id,
        dept_id=sales_dept.id, status="active", is_trainee=False,
    )
    in_memory_db.add(non_owner)
    in_memory_db.commit()

    plan = TrainingPlan(title="IT安全講習", dept_id=it_dept.id, year="2026")
    in_memory_db.add(plan)
    in_memory_db.commit()

    _switch_current_user(non_owner)
    resp = client.delete(f"/api/training/plans/{plan.id}")
    assert resp.status_code == 403

    owner_user = User(
        emp_id="owner", name="開課單位", role_id=user_role.id,
        dept_id=it_dept.id, status="active", is_trainee=False,
    )
    in_memory_db.add(owner_user)
    in_memory_db.commit()
    _switch_current_user(owner_user)
    resp = client.delete(f"/api/training/plans/{plan.id}")
    assert resp.status_code == 200


def test_delete_question_bank_denied_for_non_owner_dept(client, in_memory_db):
    it_dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    sales_dept = _make_second_dept(in_memory_db)
    user_role = in_memory_db.query(Role).filter(Role.name == "User").first()
    _grant_function(in_memory_db, user_role, "menu:exam")

    non_owner = User(
        emp_id="non-owner2", name="非開課單位", role_id=user_role.id,
        dept_id=sales_dept.id, status="active", is_trainee=False,
    )
    in_memory_db.add(non_owner)
    in_memory_db.commit()

    q = QuestionBank(content="Q1", question_type="single", answer="A", dept_id=it_dept.id)
    in_memory_db.add(q)
    in_memory_db.commit()

    _switch_current_user(non_owner)
    resp = client.delete(f"/api/admin/question-bank/{q.id}")
    assert resp.status_code == 403
