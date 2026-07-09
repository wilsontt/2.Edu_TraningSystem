"""套組模型關聯與唯一約束測試。"""
import datetime
import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (
    TeachingMaterialSet, TeachingMaterialFile, TeachingMaterialSetPlan,
    MaterialType, TrainingPlan, Department,
)


def test_create_set_with_files_and_relationship(in_memory_db):
    db = in_memory_db
    mt = MaterialType(name="操作手冊", slug="opm", sort_order=1)
    db.add(mt)
    db.commit()

    s = TeachingMaterialSet(
        title="安全教育教材", material_type_id=mt.id, year="2026",
        uploaded_by="admin1", uploaded_at=datetime.datetime.utcnow(), is_active=True,
    )
    db.add(s)
    db.commit()

    f1 = TeachingMaterialFile(
        set_id=s.id, original_filename="a.pdf", stored_filename="1.pdf",
        storage_path="2026/sets/1/teaching/opm/1.pdf", file_format="pdf",
        file_size_bytes=100, uploaded_by="admin1",
        uploaded_at=datetime.datetime.utcnow(), is_active=True,
    )
    db.add(f1)
    db.commit()

    assert s.files[0].id == f1.id
    assert f1.material_set.id == s.id


def test_set_plan_binding_and_unique_constraint(in_memory_db):
    db = in_memory_db
    it_dept = db.query(Department).filter(Department.name == "IT部").first()
    mt = MaterialType(name="操作手冊", slug="opm")
    db.add(mt)
    db.commit()
    plan = TrainingPlan(title="測試計畫", dept_id=it_dept.id, year="2026")
    db.add(plan)
    db.commit()
    s = TeachingMaterialSet(
        title="套組A", material_type_id=mt.id, year="2026",
        uploaded_by="admin1", uploaded_at=datetime.datetime.utcnow(),
    )
    db.add(s)
    db.commit()

    db.add(TeachingMaterialSetPlan(set_id=s.id, plan_id=plan.id))
    db.commit()
    assert s.set_plans[0].plan.title == "測試計畫"

    db.add(TeachingMaterialSetPlan(set_id=s.id, plan_id=plan.id))  # 重複綁定
    with pytest.raises(IntegrityError):
        db.commit()
