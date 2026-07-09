"""
pytest 設定與共享 Fixtures。

§1.1 #3 測試隔離：所有測試使用 in-memory SQLite，
嚴禁連線 data/education_training.db。
"""
import os
import sys

# 讓 tests/ 下的程式可以 import backend/app/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Department, Role


@pytest.fixture
def in_memory_db():
    """每個測試使用獨立的 in-memory SQLite DB。"""
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()

    # 基礎種子資料
    it_dept = Department(name="IT部")
    session.add(it_dept)
    admin_role = Role(name="Admin")
    sysadmin_role = Role(name="系統管理")
    user_role = Role(name="User")
    session.add_all([admin_role, sysadmin_role, user_role])
    session.commit()

    yield session

    session.close()
    engine.dispose()


from fastapi.testclient import TestClient


@pytest.fixture
def client(in_memory_db):
    """FastAPI TestClient：覆寫 get_db 使用 in_memory_db，覆寫 get_current_user 為固定管理員，
    略過真實 JWT／AD 驗證。不觸發 startup event（不用 `with` context manager），故不會連線真實 DB。"""
    from app.main import app
    from app.database import get_db
    from app.routers.auth import get_current_user
    from app.models import Role, User

    admin_role = in_memory_db.query(Role).filter(Role.name == "Admin").first()
    admin_user = User(
        emp_id="test-admin", name="Test Admin", role_id=admin_role.id,
        status="active", is_trainee=False,
    )
    in_memory_db.add(admin_user)
    in_memory_db.commit()
    in_memory_db.refresh(admin_user)

    def _get_db():
        yield in_memory_db

    def _get_current_user():
        return admin_user

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = _get_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()
