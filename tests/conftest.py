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
def in_memory_db(tmp_path):
    """每個測試使用獨立的、暫存檔案型 SQLite DB（非 `:memory:`）。

    改用 `tmp_path` 暫存檔而非 `:memory:` + `StaticPool`：TestClient 透過 anyio
    執行請求時，同步依賴（`get_db`）與非同步路由本體、以及 `record_file_transfer`
    的獨立稽核 log session，皆各自建立連線。若沿用 `:memory:` + `StaticPool`，
    所有 Session 會共用同一條實體連線；`record_file_transfer` 的 session 一旦
    commit，會連帶提交路由自身 session 尚未 commit 的變更，導致 `db.rollback()`
    對已被連帶提交的資料完全失效，破壞 create_set 這類多檔案上傳的 atomic
    rollback 保證。改用暫存檔資料庫後，各 Session 各自持有獨立連線、僅共享「已
    提交」的資料，行為貼近正式環境（每個 Session 對應一條真實資料庫連線）；
    `tmp_path` 由 pytest 自動於測試結束後清除，不會於 `data/` 或 repo 內殘留
    `.sqlite3`/`-wal`/`-shm` 檔案。
    """
    db_path = tmp_path / "test.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
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
def client(in_memory_db, monkeypatch):
    """FastAPI TestClient：覆寫 get_db 使用 in_memory_db，覆寫 get_current_user 為固定管理員，
    略過真實 JWT／AD 驗證。不觸發 startup event（不用 `with` context manager），故不會連線真實 DB。

    另外將 `app.services.audit_log.SessionLocal` monkeypatch 為綁定同一 in-memory engine 的
    sessionmaker：`record_file_transfer()` 內部直接呼叫 `SessionLocal()`（獨立交易，不經
    `get_db` 依賴注入），若不攔截會繞過上方 in_memory_db 覆寫，直接寫入正式的
    data/education_training.db，違反本檔頂部「嚴禁連線 data/education_training.db」的規則。
    """
    from app.main import app
    from app.database import get_db
    from app.routers.auth import get_current_user
    from app.models import Role, User
    import app.services.audit_log as audit_log_module

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

    engine = in_memory_db.get_bind()
    TestSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    monkeypatch.setattr(audit_log_module, "SessionLocal", TestSessionLocal)

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = _get_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()
