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
