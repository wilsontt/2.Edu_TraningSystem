"""
init_db 預設種子資料測試。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.init_db import init_db


class _Settings:
    initial_admin_password = ""


def test_init_db_creates_system_management_department_and_admin(monkeypatch, tmp_path):
    db_path = tmp_path / "init-db.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    import app.init_db as init_db_module

    monkeypatch.setattr(init_db_module, "engine", engine)
    monkeypatch.setattr(init_db_module, "SessionLocal", SessionLocal)
    monkeypatch.setattr(init_db_module, "get_settings", lambda: _Settings())

    init_db()

    session = SessionLocal()
    try:
        dept = session.query(models.Department).filter(models.Department.name == "系統管理").first()
        assert dept is not None

        admin_user = session.query(models.User).filter(models.User.emp_id == "admin").first()
        assert admin_user is not None
        assert admin_user.dept_id == dept.id
    finally:
        session.close()
