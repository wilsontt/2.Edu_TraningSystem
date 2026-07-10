# 教材套組（Wave 2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將教材庫從「一檔一筆」升級為「教材套組」（一標題可含多檔、可綁 0~N 個訓練計畫），依 `1.docs/02-棕地專案/plans/已完成/20260617_教材上傳列管與教材庫_PLAN.md` §5.12（2026-07-09 業主核可）實作新表、遷移、API 與前端雙檢視教材庫。

**Architecture:**
- 後端新增 3 張表（`teaching_material_sets`／`teaching_material_files`／`teaching_material_set_plans`），舊表 `teaching_materials` 停止寫入、僅唯讀封存（遷移來源）。
- 新端點集中於新檔 `backend/app/routers/teaching_material_sets.py`（沿用既有 prefix `/admin/teaching-materials`，與 `teaching_materials.py` 並存於 `main.py`）；`teaching_materials.py` 僅保留教材類型／格式主檔維護與 NAS 登入端點，並匯出共用小工具供新路由匯入。
- 前端抽出共用型別（`types/materials.ts`）、共用 API 封裝（`api/teachingMaterials.ts`）、共用 NAS 傳輸 hook（`hooks/useNasTransfer.ts`），`TeachingMaterialLibrary.tsx` 改為套組／檔案雙檢視，`PlanMaterialsSection.tsx` 改用套組元件（鎖定當前計畫）。

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic（後端）；React 19 + TypeScript + Tailwind（前端）；pytest + in-memory SQLite（後端測試）；`npm run build`/`npm run lint`（前端無單元測試框架，以型別檢查與建置驗證）。

## Global Constraints

- 所有程式註解、UI 文案、commit 訊息均使用繁體中文（CLAUDE.md 語言規範）。
- 命名慣例：Python `snake_case`；TypeScript 變數/函式 `camelCase`、型別/元件 `PascalCase`。
- 新端點沿用既有 `check_permission("menu:exam")` 權限模式（與 Wave1 一致）；不在本次擴充 `access_scope.py` 的資料範圍過濾（超出 §5.12 核可範圍，YAGNI）。
- 遷移**不搬動 NAS 實體檔**：`teaching_material_files.storage_path` 對遷移列沿用 Wave1 原值（PLAN §5.12.7 允許「路徑可保留」）；僅新建立的套組使用新路徑格式 `{year}/sets/{set_id}/teaching/{type_slug}/{file_id}.{ext}`。
- 後端測試指令（於專案根目錄執行）：`backend/.venv/bin/python3 -m pytest tests/<檔名> -v`（`tests/conftest.py` 已將 `backend/` 加入 `sys.path`）。
- 前端無單元測試框架；每個前端任務以 `cd frontend && npm run build && npm run lint` 驗證型別與規則正確，並在最後一個前端任務後於瀏覽器手動驗證關鍵流程。
- API 一律掛在既有 prefix `/admin/teaching-materials` 下（新路由檔另掛同 prefix router，見 Task 8）。
- 單檔上限＝`min(系統硬上限, 教材類型上限, 格式上限)`，沿用既有 `_effective_max_bytes()`；批次上傳/下載數量與總量沿用既有 `config.py` 設定值，不新增環境變數。

---

## Task 1：新增 SQLAlchemy 模型（套組／檔案／計畫綁定）

**Files:**
- Modify: `backend/app/models.py`（頂部 import 一行；檔尾新增 3 個 class）
- Test: `tests/test_teaching_material_set_models.py`

**Interfaces:**
- Produces：`models.TeachingMaterialSet`（欄位：`id, title, material_type_id, description, tags, year, uploaded_by, uploaded_at, is_active`；`relationship files, set_plans, material_type`）
- Produces：`models.TeachingMaterialFile`（欄位：`id, set_id, original_filename, stored_filename, storage_path, file_format, file_size_bytes, uploaded_by, uploaded_at, is_active, migrated_from_id`；`relationship material_set`）
- Produces：`models.TeachingMaterialSetPlan`（欄位：`id, set_id, plan_id`；`UniqueConstraint(set_id, plan_id)`；`relationship material_set, plan`）
- 後續 Task（2, 3, ...）皆 import 這三個 class。

- [ ] **Step 1：修改 import，加入 `UniqueConstraint`**

在 `backend/app/models.py` 第 1 行：

```python
from sqlalchemy import Column, Integer, String, Text, Boolean, Date, DateTime, ForeignKey, Table, UniqueConstraint
```

- [ ] **Step 2：於 `TeachingMaterial` class 之後（約第 354 行後）新增三個 class**

```python
class TeachingMaterialSet(Base):
    """教材套組主檔（Wave 2）：一標題可含多檔、可綁 0~N 個訓練計畫。
    見教材 PLAN §5.12.2。無 set_plans 綁定 = 通用教材。"""
    __tablename__ = "teaching_material_sets"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    material_type_id = Column(Integer, ForeignKey("material_types.id"), nullable=False)
    description = Column(String, nullable=True)
    tags = Column(Text, nullable=True)              # JSON 字串
    year = Column(String, nullable=False)
    uploaded_by = Column(String, nullable=False)     # emp_id
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    is_active = Column(Boolean, default=True, index=True)

    material_type = relationship("MaterialType")
    files = relationship("TeachingMaterialFile", back_populates="material_set")
    set_plans = relationship("TeachingMaterialSetPlan", back_populates="material_set")


class TeachingMaterialFile(Base):
    """套組內檔案（Wave 2）：NAS 檔名依 id 命名，實體檔存於 NAS（見教材 PLAN §5.12.1）。"""
    __tablename__ = "teaching_material_files"
    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(Integer, ForeignKey("teaching_material_sets.id"), nullable=False, index=True)
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)    # 相對 MATERIALS_ROOT；一律 `/` 邏輯路徑
    file_format = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    uploaded_by = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    is_active = Column(Boolean, default=True, index=True)
    migrated_from_id = Column(Integer, nullable=True)  # 遷移溯源：舊 teaching_materials.id（冪等判斷用）

    material_set = relationship("TeachingMaterialSet", back_populates="files")


class TeachingMaterialSetPlan(Base):
    """套組 ↔ 訓練計畫（M2M）；此表對某 set 無列 = 通用教材（見教材 PLAN §5.12.2）。"""
    __tablename__ = "teaching_material_set_plans"
    __table_args__ = (UniqueConstraint("set_id", "plan_id", name="uq_set_plan"),)
    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(Integer, ForeignKey("teaching_material_sets.id"), nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"), nullable=False, index=True)

    material_set = relationship("TeachingMaterialSet", back_populates="set_plans")
    plan = relationship("TrainingPlan")
```

- [ ] **Step 3：寫測試 `tests/test_teaching_material_set_models.py`**

```python
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
```

- [ ] **Step 4：執行測試確認通過**

於專案根目錄執行：

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_set_models.py -v
```

Expected: 2 passed.

- [ ] **Step 5：Commit**

```bash
git add backend/app/models.py tests/test_teaching_material_set_models.py
git commit -m "feat(materials): 新增教材套組三張表模型（sets/files/set_plans）"
```

---

## Task 2：遷移腳本（建表 + Wave1→Wave2 資料遷移，冪等）

**Files:**
- Create: `backend/migrations/add_teaching_material_sets.py`
- Test: `tests/test_teaching_material_sets_migration.py`

**Interfaces:**
- Consumes：無（純 `sqlite3`，不依賴 SQLAlchemy models，與既有遷移腳本慣例一致）。
- Produces：`run_migration(db_path: str | None = None) -> None`（供腳本直接執行與測試呼叫）。

- [ ] **Step 1：建立遷移腳本**

`backend/migrations/add_teaching_material_sets.py`：

```python
"""
新增教材套組三張表（teaching_material_sets / teaching_material_files /
teaching_material_set_plans），並將既有 Wave1 teaching_materials（is_active=1）
資料遷移為「1 舊筆 → 1 set + 1 file +（若有 plan_id）1 set_plan」。

執行方式：於 backend 目錄下執行 python migrations/add_teaching_material_sets.py

冪等（可重複執行）：
- 建表一律 CREATE TABLE IF NOT EXISTS。
- 資料遷移以 teaching_material_files.migrated_from_id 是否已存在該 Wave1 id 判斷是否已遷移。
- NAS 實體檔路徑（storage_path）維持原值，不搬動實體檔（教材 PLAN §5.12.7 允許「路徑可保留」）。
執行前請先備份資料庫。
"""
import sqlite3
import os
from typing import Optional

db_path_default = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")

CREATE_SETS = """
CREATE TABLE IF NOT EXISTS teaching_material_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR NOT NULL,
    material_type_id INTEGER NOT NULL,
    description VARCHAR,
    tags TEXT,
    year VARCHAR NOT NULL,
    uploaded_by VARCHAR NOT NULL,
    uploaded_at DATETIME,
    is_active BOOLEAN DEFAULT 1
)
"""

CREATE_FILES = """
CREATE TABLE IF NOT EXISTS teaching_material_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL,
    original_filename VARCHAR NOT NULL,
    stored_filename VARCHAR NOT NULL,
    storage_path VARCHAR NOT NULL,
    file_format VARCHAR NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    uploaded_by VARCHAR NOT NULL,
    uploaded_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    migrated_from_id INTEGER
)
"""

CREATE_SET_PLANS = """
CREATE TABLE IF NOT EXISTS teaching_material_set_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    UNIQUE(set_id, plan_id)
)
"""


def run_migration(db_path: Optional[str] = None) -> None:
    path = db_path or db_path_default
    if not os.path.exists(path):
        print(f"Database {path} not found.")
        return

    print(f"Migrating database: {path}")
    conn = sqlite3.connect(path)
    cursor = conn.cursor()

    try:
        cursor.execute(CREATE_SETS)
        cursor.execute(CREATE_FILES)
        cursor.execute(CREATE_SET_PLANS)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tms_active ON teaching_material_sets (is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tmf_set_active ON teaching_material_files (set_id, is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tmsp_set ON teaching_material_set_plans (set_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_tmsp_plan ON teaching_material_set_plans (plan_id)")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='teaching_materials'")
        if cursor.fetchone():
            _migrate_wave1_data(cursor)

        conn.commit()
        print("Migration completed successfully.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate_wave1_data(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        "SELECT id, plan_id, title, material_type_id, description, tags, original_filename, "
        "stored_filename, storage_path, file_format, file_size_bytes, year, uploaded_by, uploaded_at "
        "FROM teaching_materials WHERE is_active = 1"
    )
    rows = cursor.fetchall()
    migrated, skipped = 0, 0
    for row in rows:
        (old_id, plan_id, title, material_type_id, description, tags, original_filename,
         stored_filename, storage_path, file_format, file_size_bytes, year, uploaded_by,
         uploaded_at) = row

        cursor.execute("SELECT 1 FROM teaching_material_files WHERE migrated_from_id = ?", (old_id,))
        if cursor.fetchone():
            skipped += 1
            continue

        cursor.execute(
            "INSERT INTO teaching_material_sets "
            "(title, material_type_id, description, tags, year, uploaded_by, uploaded_at, is_active) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
            (title, material_type_id, description, tags, year, uploaded_by, uploaded_at),
        )
        set_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO teaching_material_files "
            "(set_id, original_filename, stored_filename, storage_path, file_format, "
            "file_size_bytes, uploaded_by, uploaded_at, is_active, migrated_from_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
            (set_id, original_filename, stored_filename, storage_path, file_format,
             file_size_bytes, uploaded_by, uploaded_at, old_id),
        )

        if plan_id is not None:
            cursor.execute(
                "INSERT OR IGNORE INTO teaching_material_set_plans (set_id, plan_id) VALUES (?, ?)",
                (set_id, plan_id),
            )
        migrated += 1

    print(f"Wave1 → Wave2 遷移完成：{migrated} 筆搬移、{skipped} 筆已存在（略過）。")


if __name__ == "__main__":
    run_migration()
```

- [ ] **Step 2：寫遷移測試**

`tests/test_teaching_material_sets_migration.py`：

```python
"""教材套組遷移腳本測試：建表 + Wave1→Wave2 資料搬移 + 冪等性。"""
import importlib.util
import os
import sqlite3


def _load_migration_module():
    path = os.path.join(os.path.dirname(__file__), "..", "backend", "migrations", "add_teaching_material_sets.py")
    spec = importlib.util.spec_from_file_location("add_teaching_material_sets", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_wave1_db(tmp_path):
    db_path = str(tmp_path / "wave1.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE teaching_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER, title VARCHAR, material_type_id INTEGER,
            description VARCHAR, tags TEXT, original_filename VARCHAR,
            stored_filename VARCHAR, storage_path VARCHAR, file_format VARCHAR,
            file_size_bytes INTEGER, year VARCHAR, sub_category_id INTEGER,
            uploaded_by VARCHAR, uploaded_at DATETIME, is_active BOOLEAN DEFAULT 1,
            deactivated_at DATETIME, deactivated_by VARCHAR,
            replaced_by_id INTEGER, replaces_id INTEGER
        )
    """)
    conn.execute(
        "INSERT INTO teaching_materials "
        "(plan_id, title, material_type_id, original_filename, stored_filename, storage_path, "
        "file_format, file_size_bytes, year, uploaded_by, uploaded_at, is_active) "
        "VALUES (7, '操作手冊 v1', 1, 'manual.pdf', '1.pdf', '2026/7/teaching/opm/1.pdf', "
        "'pdf', 12345, '2026', 'admin1', '2026-01-01 00:00:00', 1)"
    )
    conn.execute(
        "INSERT INTO teaching_materials "
        "(plan_id, title, material_type_id, original_filename, stored_filename, storage_path, "
        "file_format, file_size_bytes, year, uploaded_by, uploaded_at, is_active) "
        "VALUES (NULL, '已停用教材', 1, 'old.pdf', '2.pdf', '2026/general/teaching/opm/2.pdf', "
        "'pdf', 999, '2026', 'admin1', '2026-01-01 00:00:00', 0)"
    )
    conn.commit()
    conn.close()
    return db_path


def test_migration_creates_tables_and_migrates_active_rows(tmp_path):
    mod = _load_migration_module()
    db_path = _make_wave1_db(tmp_path)

    mod.run_migration(db_path)

    conn = sqlite3.connect(db_path)
    sets = conn.execute(
        "SELECT title, material_type_id, year, uploaded_by FROM teaching_material_sets"
    ).fetchall()
    assert sets == [("操作手冊 v1", 1, "2026", "admin1")]  # 已停用的舊筆不遷移

    files = conn.execute(
        "SELECT set_id, original_filename, storage_path, migrated_from_id FROM teaching_material_files"
    ).fetchall()
    assert len(files) == 1
    assert files[0][1] == "manual.pdf"
    assert files[0][2] == "2026/7/teaching/opm/1.pdf"  # 路徑沿用原值，不搬動實體檔
    assert files[0][3] == 1

    plans = conn.execute("SELECT set_id, plan_id FROM teaching_material_set_plans").fetchall()
    assert plans == [(1, 7)]
    conn.close()


def test_migration_is_idempotent(tmp_path):
    mod = _load_migration_module()
    db_path = _make_wave1_db(tmp_path)

    mod.run_migration(db_path)
    mod.run_migration(db_path)

    conn = sqlite3.connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM teaching_material_sets").fetchone()[0]
    assert count == 1
    conn.close()
```

- [ ] **Step 3：執行測試確認通過**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_migration.py -v
```

Expected: 2 passed.

- [ ] **Step 4：Commit**

```bash
git add backend/migrations/add_teaching_material_sets.py tests/test_teaching_material_sets_migration.py
git commit -m "feat(materials): 新增教材套組遷移腳本（建表+Wave1資料遷移，冪等）"
```

---

## Task 3：測試用 TestClient fixture + Schemas + `POST /sets`（建立套組）

本專案目前沒有任何 FastAPI `TestClient` 測試（僅有直接操作 SQLAlchemy session 的單元測試）。本任務先建立可重用的 `client` fixture（覆寫 `get_db`／`get_current_user`，略過真實 JWT 與 NAS），後續 Task 4~7 都會用到。

**Files:**
- Modify: `tests/conftest.py`（新增 `client` fixture）
- Modify: `backend/app/schemas.py`（新增套組相關 schema）
- Create: `backend/app/routers/teaching_material_sets.py`
- Modify: `backend/app/main.py`（掛載新路由）
- Test: `tests/test_teaching_material_sets_api.py`

**Interfaces:**
- Consumes：`models.TeachingMaterialSet/File/SetPlan`（Task 1）；`teaching_materials._client_ip, _validate_filename, _effective_max_bytes, _resolve_credentials, _content_disposition, _parse_tags`（既有函式，原樣沿用）。
- Produces：`schemas.TeachingMaterialSetOut`、`schemas.TeachingMaterialSetListOut`、`schemas.TeachingMaterialSetUpdate`、`schemas.TeachingMaterialSetPlansUpdate`、`schemas.SetFileUploadResult`、`schemas.TeachingMaterialFileListOut`、`schemas.SetBatchDownloadRequest`（Task 4~7 會用到後三者以外的其餘 schema；`TeachingMaterialFileListOut`／`SetBatchDownloadRequest` 於本 Task 一併宣告以免後續任務再改 schemas.py）。
- Produces：`teaching_material_sets.router`（`APIRouter(prefix="/admin/teaching-materials", tags=["teaching-material-sets"])`），內含 `_set_to_out(db, s, include_files=False) -> dict`、`_derive_year(plans) -> str`、`_parse_id_list(raw) -> List[int]`、`_find_active_file_conflict(db, set_id, filename)`（Task 6 會用到後者）。
- 後續 Task 4~7 都在同一個 `teaching_material_sets.py` 檔案內新增端點，並沿用本 Task 定義的 helper。

- [ ] **Step 1：於 `tests/conftest.py` 新增 `client` fixture**

在 `tests/conftest.py` 檔尾新增（`in_memory_db` fixture 之後）：

```python
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
```

- [ ] **Step 2：於 `backend/app/schemas.py` 新增套組相關 schema**

於 `BatchDownloadRequest` class 之後（既有 Wave1 schema 區塊尾端）新增：

```python
# ----------------------------------------------------------------
# 教材套組相關模型（Wave 2；見教材 PLAN §5.12、§7）
# ----------------------------------------------------------------

class TeachingMaterialSetFileOut(BaseModel):
    id: int
    original_filename: str
    file_format: str
    file_size_bytes: int
    uploaded_by: str
    uploaded_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class TeachingMaterialSetOut(BaseModel):
    id: int
    title: str
    material_type_id: int
    description: Optional[str] = None
    tags: Optional[str] = None
    year: str
    uploaded_by: str
    uploaded_at: datetime
    is_active: bool
    file_count: int
    plan_ids: List[int] = []
    plan_titles: List[str] = []
    files: Optional[List[TeachingMaterialSetFileOut]] = None


class TeachingMaterialSetListOut(BaseModel):
    items: List[TeachingMaterialSetOut]
    total: int
    page: int
    size: int
    total_pages: int


class TeachingMaterialSetUpdate(BaseModel):
    title: Optional[str] = None
    material_type_id: Optional[int] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class TeachingMaterialSetPlansUpdate(BaseModel):
    plan_ids: List[int] = []


class SetFileUploadResult(BaseModel):
    succeeded: List[dict]  # { id, original_filename, overwritten }
    failed: List[dict]     # { original_filename, reason }


class TeachingMaterialFileListItemOut(BaseModel):
    id: int
    set_id: int
    set_title: str
    original_filename: str
    file_format: str
    file_size_bytes: int
    uploaded_by: str
    uploaded_at: datetime
    is_active: bool
    plan_titles: List[str] = []


class TeachingMaterialFileListOut(BaseModel):
    items: List[TeachingMaterialFileListItemOut]
    total: int
    page: int
    size: int
    total_pages: int


class SetBatchDownloadRequest(BaseModel):
    file_ids: List[int]
    nas_username: Optional[str] = None
    nas_password: Optional[str] = None
    nas_session_token: Optional[str] = None
```

（`schemas.py` 檔頭已 `from datetime import datetime`、`from typing import List, Optional`、`from pydantic import BaseModel`，無需新增 import。）

- [ ] **Step 3：建立 `backend/app/routers/teaching_material_sets.py`**

```python
"""
教材套組路由 (Teaching Material Sets Router) — Wave 2

一標題可含多檔、可綁 0~N 個訓練計畫；套組內同名檔上傳需明確指定是否覆蓋。
沿用 teaching_materials.py 之共用小工具（副檔名白名單驗證、單檔上限、NAS 憑證解析、
Content-Disposition、Audit）。準據：教材 PLAN（20260617）§5.12。
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
import os
import io
import json
import zipfile
from datetime import datetime

from .. import models, schemas
from ..database import get_db
from ..config import get_settings
from .auth import check_permission
from ..services import storage
from ..services.audit_log import record_file_transfer
from .teaching_materials import (
    _client_ip, _validate_filename, _effective_max_bytes,
    _resolve_credentials, _content_disposition, _parse_tags,
)

router = APIRouter(prefix="/admin/teaching-materials", tags=["teaching-material-sets"])


# ----------------------------------------------------------------
# 共用小工具
# ----------------------------------------------------------------

def _parse_id_list(raw: Optional[str]) -> List[int]:
    """plan_ids 接受 JSON 陣列字串或逗號分隔；回傳 int 陣列。"""
    if not raw:
        return []
    try:
        val = json.loads(raw)
        if isinstance(val, list):
            return [int(v) for v in val]
    except (ValueError, TypeError):
        pass
    return [int(p.strip()) for p in raw.split(",") if p.strip()]


def _derive_year(plans: List["models.TrainingPlan"]) -> str:
    """套組年度：優先取第一個綁定計畫的年度，否則用系統年度。"""
    for p in plans:
        if p.year:
            return p.year
    return str(datetime.utcnow().year)


def _set_to_out(db: Session, s: "models.TeachingMaterialSet", include_files: bool = False) -> dict:
    file_count = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.set_id == s.id,
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
    ).count()
    plans = db.query(models.TrainingPlan).join(
        models.TeachingMaterialSetPlan, models.TeachingMaterialSetPlan.plan_id == models.TrainingPlan.id
    ).filter(models.TeachingMaterialSetPlan.set_id == s.id).all()
    out = {
        "id": s.id, "title": s.title, "material_type_id": s.material_type_id,
        "description": s.description, "tags": s.tags, "year": s.year,
        "uploaded_by": s.uploaded_by, "uploaded_at": s.uploaded_at, "is_active": s.is_active,
        "file_count": file_count,
        "plan_ids": [p.id for p in plans],
        "plan_titles": [p.title for p in plans],
    }
    if include_files:
        files = db.query(models.TeachingMaterialFile).filter(
            models.TeachingMaterialFile.set_id == s.id,
            models.TeachingMaterialFile.is_active == True,  # noqa: E712
        ).order_by(models.TeachingMaterialFile.uploaded_at.asc()).all()
        out["files"] = files
    return out


def _find_active_file_conflict(db: Session, set_id: int, filename: str) -> Optional["models.TeachingMaterialFile"]:
    return db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.set_id == set_id,
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
        models.TeachingMaterialFile.original_filename == filename,
    ).first()


# ----------------------------------------------------------------
# 建立套組（+ 首批檔案）
# ----------------------------------------------------------------

@router.post("/sets", response_model=schemas.TeachingMaterialSetOut)
async def create_set(
    request: Request,
    title: str = Form(...),
    material_type_id: int = Form(...),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    plan_ids: Optional[str] = Form(None),
    nas_username: Optional[str] = Form(None),
    nas_password: Optional[str] = Form(None),
    nas_session_token: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """建立教材套組＋首批檔案。原子建立：任一檔案格式/大小驗證失敗即整批拒絕，不建立套組。"""
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    mt = db.query(models.MaterialType).filter(
        models.MaterialType.id == material_type_id,
        models.MaterialType.is_active == True,  # noqa: E712
    ).first()
    if not mt:
        raise HTTPException(status_code=400, detail="教材類型不存在或已停用")

    plan_id_list = _parse_id_list(plan_ids)
    plans: List[models.TrainingPlan] = []
    for pid in plan_id_list:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == pid).first()
        if not plan:
            raise HTTPException(status_code=404, detail=f"訓練計畫不存在：{pid}")
        if plan.is_archived:
            raise HTTPException(status_code=403, detail=f"計畫已封存，無法綁定：{plan.title}")
        plans.append(plan)

    if not files:
        raise HTTPException(status_code=400, detail="請至少選擇一個檔案")
    if len(files) > settings.teaching_material_max_batch_upload_count:
        raise HTTPException(status_code=400, detail=f"單次最多上傳 {settings.teaching_material_max_batch_upload_count} 份")

    payloads = []
    total = 0
    for f in files:
        raw = await f.read()
        total += len(raw)
        payloads.append((os.path.basename(f.filename or ""), raw))
    if total > settings.teaching_material_max_batch_upload_bytes:
        raise HTTPException(status_code=400, detail="單次上傳總量超過上限")

    validated = []
    for fname, raw in payloads:
        try:
            ext, fmt = _validate_filename(fname, db)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"{fname}：{e}")
        max_bytes = _effective_max_bytes(mt, fmt)
        if len(raw) > max_bytes:
            raise HTTPException(status_code=400, detail=f"{fname}：超過單檔上限（{max_bytes} bytes）")
        validated.append((fname, raw, ext))

    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)
    year = _derive_year(plans)
    tags_json = _parse_tags(tags)

    material_set = models.TeachingMaterialSet(
        title=title, material_type_id=mt.id, description=description, tags=tags_json,
        year=year, uploaded_by=emp_id, uploaded_at=datetime.utcnow(), is_active=True,
    )
    db.add(material_set)
    db.flush()

    for plan in plans:
        db.add(models.TeachingMaterialSetPlan(set_id=material_set.id, plan_id=plan.id))

    try:
        with storage.connection(creds) as st:
            for fname, raw, ext in validated:
                mf = models.TeachingMaterialFile(
                    set_id=material_set.id, original_filename=fname, stored_filename="",
                    storage_path="", file_format=ext, file_size_bytes=len(raw),
                    uploaded_by=emp_id, uploaded_at=datetime.utcnow(), is_active=True,
                )
                db.add(mf)
                db.flush()
                stored_filename = f"{mf.id}.{ext}"
                storage_path = storage.normalize_smb_rel_path(
                    str(year), "sets", str(material_set.id), "teaching", mt.slug, stored_filename,
                )
                st.save(storage_path, raw)
                mf.stored_filename = stored_filename
                mf.storage_path = storage_path
                record_file_transfer(
                    emp_id=emp_id, client_ip=client_ip, action="upload",
                    resource_type="teaching_material", status="success", filename=fname,
                    plan_id=(plans[0].id if plans else None), resource_id=mf.id,
                    nas_username=creds.username, bytes_=len(raw),
                )
        db.commit()
    except storage.StorageUnavailable as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"NAS 無法連線或登入失敗：{e}")
    except storage.StorageError as e:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(e))

    db.refresh(material_set)
    return _set_to_out(db, material_set, include_files=True)
```

- [ ] **Step 4：於 `backend/app/main.py` 掛載新路由**

在 `from .routers import teaching_materials` 與 `app.include_router(teaching_materials.router, ...)` 之後（約第 100-101 行）新增：

```python
from .routers import teaching_material_sets
app.include_router(teaching_material_sets.router, prefix="/api")  # 教材套組（Wave 2）
```

- [ ] **Step 5：寫測試 `tests/test_teaching_material_sets_api.py`**

```python
"""教材套組 API 測試：建立套組（POST /sets）。"""
import io

from app.models import MaterialType, MaterialFileFormat


def _seed_material_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", sort_order=1, is_active=True)
    db.add(mt)
    fmt = MaterialFileFormat(ext="pdf", label="PDF", is_active=True)
    db.add(fmt)
    db.commit()
    return mt


def test_create_set_with_two_files(client, in_memory_db):
    mt = _seed_material_type(in_memory_db)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={
            "title": "安全教育教材",
            "material_type_id": str(mt.id),
            "nas_session_token": "fake-token-not-used",
        },
        files=[
            ("files", ("a.pdf", io.BytesIO(b"AAA"), "application/pdf")),
            ("files", ("b.pdf", io.BytesIO(b"BBB"), "application/pdf")),
        ],
    )
    # 未做 NAS session 驗證 mock，預期在 NAS 憑證解析階段回傳 401
    assert resp.status_code == 401
    assert "NAS" in resp.json()["detail"]


def test_create_set_rejects_disallowed_extension(client, in_memory_db):
    mt = _seed_material_type(in_memory_db)

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "測試", "material_type_id": str(mt.id)},
        files=[("files", ("virus.exe", io.BytesIO(b"AAA"), "application/octet-stream"))],
    )
    assert resp.status_code == 400
    assert "格式" in resp.json()["detail"]
```

> 說明：`create_set` 端點需要真實 NAS 連線才能完整成功（`storage.connection`），CI 環境無 NAS 可用。本任務測試聚焦「NAS 憑證缺失時正確回 401」與「格式驗證先於 NAS 連線執行」兩條可離線驗證的路徑；Task 6 會示範以 `monkeypatch` mock `storage.connection`/`storage.SmbStorage` 來測試「NAS 連線成功」路徑的完整資料寫入。

- [ ] **Step 6：執行測試確認通過**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_api.py -v
```

Expected: 2 passed.

- [ ] **Step 7：Commit**

```bash
git add tests/conftest.py backend/app/schemas.py backend/app/routers/teaching_material_sets.py backend/app/main.py tests/test_teaching_material_sets_api.py
git commit -m "feat(materials): 新增 TestClient fixture、套組 schemas 與 POST /sets 建立端點"
```

---

## Task 4：`mock_nas` fixture + `GET /sets`（套組列表／搜尋）+ `GET /sets/{id}`（詳情）

**Files:**
- Modify: `tests/conftest.py`（新增 `mock_nas` fixture）
- Modify: `backend/app/routers/teaching_material_sets.py`（新增兩端點）
- Test: `tests/test_teaching_material_sets_list.py`

**Interfaces:**
- Consumes：Task 3 的 `_set_to_out`、`client`、`_StubStorage` 概念。
- Produces：`mock_nas` fixture（回傳 `_StubStorage` 實例，供斷言 NAS 寫入內容）；後續 Task 6、7 的下載/上傳測試皆會用到。
- Produces：`GET /admin/teaching-materials/sets`（`schemas.TeachingMaterialSetListOut`）、`GET /admin/teaching-materials/sets/{set_id}`（`schemas.TeachingMaterialSetOut`，含 `files`）。

- [ ] **Step 1：於 `tests/conftest.py` 新增 `mock_nas` fixture**

檔尾新增：

```python
import contextlib


class _StubStorage:
    """假 NAS 儲存：save/open 存於記憶體 dict，供測試斷言寫入內容。"""
    def __init__(self):
        self.saved: dict[str, bytes] = {}

    def save(self, rel_path: str, data: bytes) -> int:
        self.saved[rel_path] = data
        return len(data)

    def open(self, rel_path: str) -> bytes:
        from app.services import storage
        if rel_path not in self.saved:
            raise storage.StorageError("找不到檔案")
        return self.saved[rel_path]


@pytest.fixture
def mock_nas(monkeypatch):
    """Monkeypatch NAS 憑證解析與連線，讓上傳/下載端點可在無真實 NAS 下完整測試。
    回傳 _StubStorage 實例，可用 `mock_nas.saved` 檢查寫入的 rel_path/內容。"""
    from app.services import storage
    import app.routers.teaching_material_sets as tms_router
    import app.routers.teaching_materials as tm_router

    stub = _StubStorage()
    fake_creds = storage.SmbCredentials(
        server="test-nas", share="test-share", username="tester",
        password="x", root="materials",
    )

    def _fake_resolve(nas_session_token=None, nas_username=None, nas_password=None):
        return fake_creds

    @contextlib.contextmanager
    def _fake_connection(creds):
        yield stub

    monkeypatch.setattr(tms_router, "_resolve_credentials", _fake_resolve)
    monkeypatch.setattr(tm_router, "_resolve_credentials", _fake_resolve)
    monkeypatch.setattr(storage, "connection", _fake_connection)
    return stub
```

- [ ] **Step 2：於 `backend/app/routers/teaching_material_sets.py` 新增列表／詳情端點**

在 `create_set` 函式之後新增：

```python
# ----------------------------------------------------------------
# 列表（套組檢視）／詳情
# ----------------------------------------------------------------

@router.get("/sets", response_model=schemas.TeachingMaterialSetListOut)
def list_sets(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    material_type_id: Optional[int] = None,
    file_format: Optional[str] = None,
    plan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """教材庫套組檢視：一列一套組，keyword 涵蓋標題/簡述/標籤/綁定計畫名稱（教材 PLAN §5.12.4）。"""
    q = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.is_active == True)  # noqa: E712
    if keyword:
        like = f"%{keyword}%"
        plan_match_ids = db.query(models.TeachingMaterialSetPlan.set_id).join(
            models.TrainingPlan, models.TrainingPlan.id == models.TeachingMaterialSetPlan.plan_id
        ).filter(models.TrainingPlan.title.ilike(like))
        q = q.filter(
            models.TeachingMaterialSet.title.ilike(like)
            | models.TeachingMaterialSet.description.ilike(like)
            | models.TeachingMaterialSet.tags.ilike(like)
            | models.TeachingMaterialSet.id.in_(plan_match_ids)
        )
    if material_type_id:
        q = q.filter(models.TeachingMaterialSet.material_type_id == material_type_id)
    if file_format:
        fmt_set_ids = db.query(models.TeachingMaterialFile.set_id).filter(
            models.TeachingMaterialFile.file_format == file_format,
            models.TeachingMaterialFile.is_active == True,  # noqa: E712
        )
        q = q.filter(models.TeachingMaterialSet.id.in_(fmt_set_ids))
    if plan_id:
        bound_ids = db.query(models.TeachingMaterialSetPlan.set_id).filter(
            models.TeachingMaterialSetPlan.plan_id == plan_id
        )
        q = q.filter(models.TeachingMaterialSet.id.in_(bound_ids))

    total = q.count()
    rows = q.order_by(desc(models.TeachingMaterialSet.uploaded_at)).offset((page - 1) * size).limit(size).all()
    items = [_set_to_out(db, s) for s in rows]
    return {"items": items, "total": total, "page": page, "size": size, "total_pages": (total + size - 1) // size}


@router.get("/sets/{set_id}", response_model=schemas.TeachingMaterialSetOut)
def get_set_detail(
    set_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    s = db.query(models.TeachingMaterialSet).filter(
        models.TeachingMaterialSet.id == set_id,
        models.TeachingMaterialSet.is_active == True,  # noqa: E712
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    return _set_to_out(db, s, include_files=True)
```

- [ ] **Step 3：寫測試 `tests/test_teaching_material_sets_list.py`**

```python
"""教材套組列表／搜尋／詳情測試（含綁定計畫名稱 keyword 搜尋）。"""
import io

from app.models import MaterialType, MaterialFileFormat, Department, TrainingPlan


def _seed_type_and_format(db):
    mt = MaterialType(name="操作手冊", slug="opm", sort_order=1, is_active=True)
    db.add(mt)
    fmt = MaterialFileFormat(ext="pdf", label="PDF", is_active=True)
    db.add(fmt)
    db.commit()
    return mt


def _create_set(client, mt_id, title, plan_ids=None, filename="a.pdf"):
    data = {"title": title, "material_type_id": str(mt_id)}
    if plan_ids:
        data["plan_ids"] = ",".join(str(p) for p in plan_ids)
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data=data,
        files=[("files", (filename, io.BytesIO(b"content"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_list_sets_returns_file_count_and_general_when_no_plan(client, in_memory_db, mock_nas):
    mt = _seed_type_and_format(in_memory_db)
    _create_set(client, mt.id, "通用教材")

    resp = client.get("/api/admin/teaching-materials/sets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["file_count"] == 1
    assert body["items"][0]["plan_titles"] == []


def test_search_by_bound_plan_title(client, in_memory_db, mock_nas):
    mt = _seed_type_and_format(in_memory_db)
    it_dept = in_memory_db.query(Department).filter(Department.name == "IT部").first()
    plan = TrainingPlan(title="112年度消防安全講習", dept_id=it_dept.id, year="2026")
    in_memory_db.add(plan)
    in_memory_db.commit()

    _create_set(client, mt.id, "講義", plan_ids=[plan.id])
    _create_set(client, mt.id, "無關教材")

    resp = client.get("/api/admin/teaching-materials/sets", params={"keyword": "消防安全"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "講義"
    assert body["items"][0]["plan_titles"] == ["112年度消防安全講習"]


def test_get_set_detail_includes_files(client, in_memory_db, mock_nas):
    mt = _seed_type_and_format(in_memory_db)
    created = _create_set(client, mt.id, "詳情測試")

    resp = client.get(f"/api/admin/teaching-materials/sets/{created['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["files"]) == 1
    assert body["files"][0]["original_filename"] == "a.pdf"


def test_get_set_detail_404_when_not_found(client, in_memory_db):
    resp = client.get("/api/admin/teaching-materials/sets/9999")
    assert resp.status_code == 404
```

- [ ] **Step 4：執行測試確認通過**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_list.py tests/test_teaching_material_sets_api.py -v
```

Expected: 全部 passed（含 Task 3 測試迴歸）。

- [ ] **Step 5：Commit**

```bash
git add tests/conftest.py backend/app/routers/teaching_material_sets.py tests/test_teaching_material_sets_list.py
git commit -m "feat(materials): 新增套組列表/搜尋(含計畫名稱)/詳情端點；新增 mock_nas 測試 fixture"
```

---

## Task 5：`PUT /sets/{id}`（中繼資料）+ `PUT /sets/{id}/plans`（計畫綁定）+ `DELETE /sets/{id}`（軟刪）

驗收對應：教材 PLAN §5.12.8 S6（通用套組綁定計畫 A → 顯示計畫名稱，非「通用」）、S7（綁定 A、B → 皆可見）、S8（解除全部綁定 → 恢復「通用」）。

**Files:**
- Modify: `backend/app/routers/teaching_material_sets.py`
- Test: `tests/test_teaching_material_sets_update.py`

**Interfaces:**
- Consumes：Task 3/4 的 `_set_to_out`、`client`、`mock_nas`。
- Produces：`PUT /admin/teaching-materials/sets/{set_id}`、`PUT /admin/teaching-materials/sets/{set_id}/plans`、`DELETE /admin/teaching-materials/sets/{set_id}`。

- [ ] **Step 1：於 `teaching_material_sets.py` 新增三端點**

在 `get_set_detail` 之後新增：

```python
# ----------------------------------------------------------------
# 更新中繼資料 / 計畫綁定 / 軟刪除
# ----------------------------------------------------------------

@router.put("/sets/{set_id}", response_model=schemas.TeachingMaterialSetOut)
def update_set(
    set_id: int,
    payload: schemas.TeachingMaterialSetUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    s = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    data = payload.model_dump(exclude_unset=True)
    if "tags" in data:
        tags_val = data.pop("tags")
        s.tags = json.dumps([str(t) for t in tags_val], ensure_ascii=False) if tags_val else None
    if "material_type_id" in data and data["material_type_id"] is not None:
        mt = db.query(models.MaterialType).filter(models.MaterialType.id == data["material_type_id"]).first()
        if not mt:
            raise HTTPException(status_code=400, detail="教材類型不存在")
    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _set_to_out(db, s, include_files=True)


@router.put("/sets/{set_id}/plans", response_model=schemas.TeachingMaterialSetOut)
def update_set_plans(
    set_id: int,
    payload: schemas.TeachingMaterialSetPlansUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """完整取代套組的綁定計畫列表；空陣列＝解除全部綁定，恢復「通用」（教材 PLAN §5.12.2）。"""
    s = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    plans = []
    for pid in payload.plan_ids:
        plan = db.query(models.TrainingPlan).filter(models.TrainingPlan.id == pid).first()
        if not plan:
            raise HTTPException(status_code=404, detail=f"訓練計畫不存在：{pid}")
        plans.append(plan)
    db.query(models.TeachingMaterialSetPlan).filter(models.TeachingMaterialSetPlan.set_id == set_id).delete()
    for plan in plans:
        db.add(models.TeachingMaterialSetPlan(set_id=set_id, plan_id=plan.id))
    db.commit()
    db.refresh(s)
    return _set_to_out(db, s, include_files=True)


@router.delete("/sets/{set_id}")
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    s = db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.id == set_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    s.is_active = False
    db.commit()
    return {"message": "已停用（軟刪除）"}
```

- [ ] **Step 2：寫測試 `tests/test_teaching_material_sets_update.py`**

```python
"""套組中繼資料更新、計畫綁定切換、軟刪除測試（教材 PLAN §5.12.8 S6/S7/S8）。"""
import io

from app.models import MaterialType, MaterialFileFormat, Department, TrainingPlan


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set(client, mt_id, title="通用教材"):
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": title, "material_type_id": str(mt_id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_plans(db, names):
    it_dept = db.query(Department).filter(Department.name == "IT部").first()
    plans = [TrainingPlan(title=n, dept_id=it_dept.id, year="2026") for n in names]
    db.add_all(plans)
    db.commit()
    return plans


def test_update_metadata(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)

    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}",
        json={"title": "新標題", "tags": ["安全", "消防"]},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "新標題"


def test_bind_then_unbind_plan_toggles_general_flag(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    plan_a, plan_b = _make_plans(in_memory_db, ["計畫A", "計畫B"])

    # S6：通用套組綁定計畫 A → 顯示計畫 A 名稱
    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}/plans",
        json={"plan_ids": [plan_a.id]},
    )
    assert resp.status_code == 200
    assert resp.json()["plan_titles"] == ["計畫A"]

    # S7：再綁計畫 B → 兩者皆可見
    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}/plans",
        json={"plan_ids": [plan_a.id, plan_b.id]},
    )
    assert sorted(resp.json()["plan_titles"]) == ["計畫A", "計畫B"]

    # S8：解除全部綁定 → 恢復「通用」（plan_titles 為空陣列）
    resp = client.put(
        f"/api/admin/teaching-materials/sets/{created['id']}/plans",
        json={"plan_ids": []},
    )
    assert resp.json()["plan_titles"] == []


def test_delete_set_soft_deletes(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)

    resp = client.delete(f"/api/admin/teaching-materials/sets/{created['id']}")
    assert resp.status_code == 200

    resp = client.get(f"/api/admin/teaching-materials/sets/{created['id']}")
    assert resp.status_code == 404  # 軟刪後列表/詳情皆視為不存在

    resp = client.get("/api/admin/teaching-materials/sets")
    assert resp.json()["total"] == 0
```

- [ ] **Step 3：執行測試確認通過**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_update.py -v
```

Expected: 3 passed.

- [ ] **Step 4：Commit**

```bash
git add backend/app/routers/teaching_material_sets.py tests/test_teaching_material_sets_update.py
git commit -m "feat(materials): 新增套組中繼資料更新/計畫綁定切換/軟刪除端點"
```

---

## Task 6：`POST /sets/{id}/files`（新增檔案＋同名覆蓋 Yes/No）+ `DELETE /sets/{id}/files/{file_id}`（移除單檔）

驗收對應：教材 PLAN §5.12.8 S2（再新增 3 檔仍 1 列）、S4（同名選 No→跳過）、S5（同名選 Yes→覆寫）、S12（移除 1 檔其餘不變）。

**Files:**
- Modify: `backend/app/routers/teaching_material_sets.py`
- Test: `tests/test_teaching_material_sets_files.py`

**Interfaces:**
- Consumes：Task 3 的 `_find_active_file_conflict`（已在 Task 3 定義，本任務為首次使用）。
- Produces：`POST /admin/teaching-materials/sets/{set_id}/files`（`schemas.SetFileUploadResult`）、`DELETE /admin/teaching-materials/sets/{set_id}/files/{file_id}`。

- [ ] **Step 1：於 `teaching_material_sets.py` 新增兩端點**

在 `delete_set` 之後新增：

```python
# ----------------------------------------------------------------
# 套組內新增檔案（同名覆蓋 Yes/No）／移除單檔
# ----------------------------------------------------------------

@router.post("/sets/{set_id}/files", response_model=schemas.SetFileUploadResult)
async def add_set_files(
    set_id: int,
    request: Request,
    files: List[UploadFile] = File(...),
    overwrite_on_duplicate: Optional[bool] = Form(None),
    nas_username: Optional[str] = Form(None),
    nas_password: Optional[str] = Form(None),
    nas_session_token: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """套組內新增檔案；套組內同名檔需以 overwrite_on_duplicate 明確指定
    True=覆蓋該檔 NAS+中繼資料、False=跳過該檔（教材 PLAN §5.12.3）。"""
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    s = db.query(models.TeachingMaterialSet).filter(
        models.TeachingMaterialSet.id == set_id,
        models.TeachingMaterialSet.is_active == True,  # noqa: E712
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="教材套組不存在")
    mt = db.query(models.MaterialType).filter(models.MaterialType.id == s.material_type_id).first()

    if not files:
        raise HTTPException(status_code=400, detail="請至少選擇一個檔案")
    if len(files) > settings.teaching_material_max_batch_upload_count:
        raise HTTPException(status_code=400, detail=f"單次最多上傳 {settings.teaching_material_max_batch_upload_count} 份")

    payloads = []
    total = 0
    for f in files:
        raw = await f.read()
        total += len(raw)
        payloads.append((os.path.basename(f.filename or ""), raw))
    if total > settings.teaching_material_max_batch_upload_bytes:
        raise HTTPException(status_code=400, detail="單次上傳總量超過上限")

    plan_row = db.query(models.TeachingMaterialSetPlan).filter(
        models.TeachingMaterialSetPlan.set_id == set_id
    ).first()
    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)

    succeeded: List[dict] = []
    failed: List[dict] = []

    try:
        with storage.connection(creds) as st:
            for fname, raw in payloads:
                try:
                    ext, fmt = _validate_filename(fname, db)
                    max_bytes = _effective_max_bytes(mt, fmt)
                    if len(raw) > max_bytes:
                        raise ValueError(f"超過單檔上限（{max_bytes} bytes）")

                    conflict = _find_active_file_conflict(db, set_id, fname)
                    overwritten = False
                    if conflict:
                        if overwrite_on_duplicate is None:
                            raise ValueError("同名衝突，需指定是否覆蓋")
                        if not overwrite_on_duplicate:
                            failed.append({"original_filename": fname, "reason": "已跳過（同名，未覆蓋）"})
                            continue
                        st.save(conflict.storage_path, raw)
                        conflict.file_format = ext
                        conflict.file_size_bytes = len(raw)
                        conflict.uploaded_by = emp_id
                        conflict.uploaded_at = datetime.utcnow()
                        db.flush()
                        rec_id = conflict.id
                        overwritten = True
                    else:
                        mf = models.TeachingMaterialFile(
                            set_id=set_id, original_filename=fname, stored_filename="",
                            storage_path="", file_format=ext, file_size_bytes=len(raw),
                            uploaded_by=emp_id, uploaded_at=datetime.utcnow(), is_active=True,
                        )
                        db.add(mf)
                        db.flush()
                        stored_filename = f"{mf.id}.{ext}"
                        storage_path = storage.normalize_smb_rel_path(
                            str(s.year), "sets", str(s.id), "teaching", mt.slug, stored_filename,
                        )
                        st.save(storage_path, raw)
                        mf.stored_filename = stored_filename
                        mf.storage_path = storage_path
                        db.flush()
                        rec_id = mf.id

                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="upload",
                        resource_type="teaching_material", status="success", filename=fname,
                        plan_id=(plan_row.plan_id if plan_row else None), resource_id=rec_id,
                        nas_username=creds.username, bytes_=len(raw),
                    )
                    succeeded.append({"id": rec_id, "original_filename": fname, "overwritten": overwritten})
                except (ValueError, storage.StorageError) as e:
                    db.rollback()
                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="upload",
                        resource_type="teaching_material", status="failed", filename=fname,
                        plan_id=(plan_row.plan_id if plan_row else None),
                        nas_username=creds.username, error_message=str(e),
                    )
                    failed.append({"original_filename": fname, "reason": str(e)})
            db.commit()
    except storage.StorageUnavailable as e:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"NAS 無法連線或登入失敗：{e}")

    return {"succeeded": succeeded, "failed": failed}


@router.delete("/sets/{set_id}/files/{file_id}")
def remove_set_file(
    set_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    mf = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.id == file_id,
        models.TeachingMaterialFile.set_id == set_id,
    ).first()
    if not mf:
        raise HTTPException(status_code=404, detail="檔案不存在")
    mf.is_active = False
    db.commit()
    return {"message": "已移除（軟刪除）"}
```

- [ ] **Step 2：寫測試 `tests/test_teaching_material_sets_files.py`**

```python
"""套組內新增檔案（同名覆蓋 Yes/No）／移除單檔測試（教材 PLAN §5.12.8 S2/S4/S5/S12）。"""
import io

from app.models import MaterialType, MaterialFileFormat


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set(client, mt_id):
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "套組", "material_type_id": str(mt_id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_add_files_keeps_single_set_row(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)

    resp = client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        files=[
            ("files", ("b.pdf", io.BytesIO(b"y"), "application/pdf")),
            ("files", ("c.pdf", io.BytesIO(b"z"), "application/pdf")),
        ],
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["succeeded"]) == 2

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 3  # S2：同套組 3 檔，仍 1 列


def test_duplicate_filename_no_overwrite_skips(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)

    resp = client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        data={"overwrite_on_duplicate": "false"},
        files=[("files", ("a.pdf", io.BytesIO(b"new-content"), "application/pdf"))],
    )
    assert resp.status_code == 200
    assert resp.json()["succeeded"] == []
    assert "已跳過" in resp.json()["failed"][0]["reason"]

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1  # S4：舊檔保留，新檔不上傳


def test_duplicate_filename_overwrite_replaces_in_place(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    original_file_id = created["files"][0]["id"]

    resp = client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        data={"overwrite_on_duplicate": "true"},
        files=[("files", ("a.pdf", io.BytesIO(b"new-content"), "application/pdf"))],
    )
    assert resp.status_code == 200
    assert resp.json()["succeeded"][0]["id"] == original_file_id  # 沿用同一 id
    assert resp.json()["succeeded"][0]["overwritten"] is True

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1  # S5：覆寫，筆數不增
    assert detail["files"][0]["file_size_bytes"] == len(b"new-content")


def test_remove_one_file_leaves_others(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        files=[("files", ("b.pdf", io.BytesIO(b"y"), "application/pdf"))],
    )
    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    target_id = detail["files"][0]["id"]

    resp = client.delete(f"/api/admin/teaching-materials/sets/{created['id']}/files/{target_id}")
    assert resp.status_code == 200

    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    assert detail["file_count"] == 1  # S12：該檔軟刪，其餘不變
```

- [ ] **Step 3：執行測試確認通過**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_files.py -v
```

Expected: 4 passed.

- [ ] **Step 4：Commit**

```bash
git add backend/app/routers/teaching_material_sets.py tests/test_teaching_material_sets_files.py
git commit -m "feat(materials): 新增套組內檔案新增(同名覆蓋Yes/No)/移除端點"
```

---

## Task 7：`GET /files`（檔案檢視列表）+ `GET /files/{id}/download`（單檔下載）+ `POST /batch-download`（批次 ZIP）

驗收對應：教材 PLAN §5.12.8 S11（套組／檔案檢視切換資料一致）。

**Files:**
- Modify: `backend/app/routers/teaching_material_sets.py`
- Test: `tests/test_teaching_material_sets_download.py`

**Interfaces:**
- Produces：`GET /admin/teaching-materials/files`（`schemas.TeachingMaterialFileListOut`）、`GET /admin/teaching-materials/files/{file_id}/download`、`POST /admin/teaching-materials/batch-download`（body: `schemas.SetBatchDownloadRequest`）。

- [ ] **Step 1：於 `teaching_material_sets.py` 新增三端點**

在 `remove_set_file` 之後新增：

```python
# ----------------------------------------------------------------
# 列表（檔案檢視）／下載（單檔 / 批次 ZIP）
# ----------------------------------------------------------------

@router.get("/files", response_model=schemas.TeachingMaterialFileListOut)
def list_files(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    material_type_id: Optional[int] = None,
    file_format: Optional[str] = None,
    plan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    """教材庫檔案檢視：一列一檔案（教材 PLAN §5.12.4）。"""
    q = db.query(models.TeachingMaterialFile).join(
        models.TeachingMaterialSet, models.TeachingMaterialSet.id == models.TeachingMaterialFile.set_id
    ).filter(
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
        models.TeachingMaterialSet.is_active == True,  # noqa: E712
    )
    if keyword:
        like = f"%{keyword}%"
        plan_match_ids = db.query(models.TeachingMaterialSetPlan.set_id).join(
            models.TrainingPlan, models.TrainingPlan.id == models.TeachingMaterialSetPlan.plan_id
        ).filter(models.TrainingPlan.title.ilike(like))
        q = q.filter(
            models.TeachingMaterialFile.original_filename.ilike(like)
            | models.TeachingMaterialSet.title.ilike(like)
            | models.TeachingMaterialSet.description.ilike(like)
            | models.TeachingMaterialSet.tags.ilike(like)
            | models.TeachingMaterialFile.set_id.in_(plan_match_ids)
        )
    if material_type_id:
        q = q.filter(models.TeachingMaterialSet.material_type_id == material_type_id)
    if file_format:
        q = q.filter(models.TeachingMaterialFile.file_format == file_format)
    if plan_id:
        bound_ids = db.query(models.TeachingMaterialSetPlan.set_id).filter(
            models.TeachingMaterialSetPlan.plan_id == plan_id
        )
        q = q.filter(models.TeachingMaterialFile.set_id.in_(bound_ids))

    total = q.count()
    rows = q.order_by(desc(models.TeachingMaterialFile.uploaded_at)).offset((page - 1) * size).limit(size).all()
    items = []
    for f in rows:
        plans = db.query(models.TrainingPlan).join(
            models.TeachingMaterialSetPlan, models.TeachingMaterialSetPlan.plan_id == models.TrainingPlan.id
        ).filter(models.TeachingMaterialSetPlan.set_id == f.set_id).all()
        items.append({
            "id": f.id, "set_id": f.set_id, "set_title": f.material_set.title,
            "original_filename": f.original_filename, "file_format": f.file_format,
            "file_size_bytes": f.file_size_bytes, "uploaded_by": f.uploaded_by,
            "uploaded_at": f.uploaded_at, "is_active": f.is_active,
            "plan_titles": [p.title for p in plans],
        })
    return {"items": items, "total": total, "page": page, "size": size, "total_pages": (total + size - 1) // size}


@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    request: Request,
    nas_session_token: Optional[str] = Query(None),
    nas_username: Optional[str] = Query(None),
    nas_password: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    mf = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.id == file_id,
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
    ).first()
    if not mf:
        raise HTTPException(status_code=404, detail="檔案不存在或已停用")

    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)
    plan_row = db.query(models.TeachingMaterialSetPlan).filter(
        models.TeachingMaterialSetPlan.set_id == mf.set_id
    ).first()
    creds = _resolve_credentials(nas_session_token, nas_username, nas_password)
    try:
        with storage.connection(creds) as st:
            data = st.open(mf.storage_path)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")
    except storage.StorageError as e:
        record_file_transfer(
            emp_id=emp_id, client_ip=client_ip, action="download", resource_type="teaching_material",
            status="failed", filename=mf.original_filename, plan_id=(plan_row.plan_id if plan_row else None),
            resource_id=mf.id, nas_username=creds.username, error_message=str(e),
        )
        raise HTTPException(status_code=404, detail="檔案不存在或讀取失敗")

    record_file_transfer(
        emp_id=emp_id, client_ip=client_ip, action="download", resource_type="teaching_material",
        status="success", filename=mf.original_filename, plan_id=(plan_row.plan_id if plan_row else None),
        resource_id=mf.id, nas_username=creds.username, bytes_=len(data),
    )
    return Response(
        content=data, media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition(mf.original_filename)},
    )


@router.post("/batch-download")
def batch_download_files(
    req: schemas.SetBatchDownloadRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    settings = get_settings()
    emp_id = getattr(current_user, "emp_id", None)
    client_ip = _client_ip(request)

    if not req.file_ids:
        raise HTTPException(status_code=400, detail="未選擇教材")
    files = db.query(models.TeachingMaterialFile).filter(
        models.TeachingMaterialFile.id.in_(req.file_ids),
        models.TeachingMaterialFile.is_active == True,  # noqa: E712
    ).all()
    if not files:
        raise HTTPException(status_code=400, detail="所選教材皆不可下載（已停用或不存在）")
    if len(files) > settings.teaching_material_max_batch_download_count:
        raise HTTPException(status_code=400, detail=f"批次下載最多 {settings.teaching_material_max_batch_download_count} 份")
    total = sum(f.file_size_bytes or 0 for f in files)
    if total > settings.teaching_material_max_batch_download_bytes:
        raise HTTPException(status_code=400, detail="批次下載總量超過上限")

    creds = _resolve_credentials(req.nas_session_token, req.nas_username, req.nas_password)
    buf = io.BytesIO()
    used_names: dict = {}
    try:
        with storage.connection(creds) as st:
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in files:
                    try:
                        data = st.open(f.storage_path)
                    except storage.StorageError as e:
                        record_file_transfer(
                            emp_id=emp_id, client_ip=client_ip, action="download",
                            resource_type="teaching_material", status="failed",
                            filename=f.original_filename, resource_id=f.id,
                            nas_username=creds.username, error_message=str(e),
                        )
                        continue
                    name = f.original_filename
                    if name in used_names:
                        name = f"{f.id}_{name}"
                    used_names[name] = True
                    zf.writestr(name, data)
                    record_file_transfer(
                        emp_id=emp_id, client_ip=client_ip, action="download",
                        resource_type="teaching_material", status="success",
                        filename=f.original_filename, resource_id=f.id,
                        nas_username=creds.username, bytes_=len(data),
                    )
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=503, detail=f"NAS 無法連線：{e}")

    zip_name = f"teaching_materials_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return Response(
        content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": _content_disposition(zip_name)},
    )
```

- [ ] **Step 2：寫測試 `tests/test_teaching_material_sets_download.py`**

```python
"""檔案檢視列表／單檔下載／批次 ZIP 下載測試（教材 PLAN §5.12.8 S11）。"""
import io
import zipfile

from app.models import MaterialType, MaterialFileFormat


def _seed_type(db):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    db.add(mt)
    db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    db.commit()
    return mt


def _create_set(client, mt_id, title="套組"):
    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": title, "material_type_id": str(mt_id)},
        files=[("files", ("a.pdf", io.BytesIO(b"hello-a"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_file_view_matches_set_view_count(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    _create_set(client, mt.id)

    sets_resp = client.get("/api/admin/teaching-materials/sets").json()
    files_resp = client.get("/api/admin/teaching-materials/files").json()

    assert files_resp["total"] == sets_resp["items"][0]["file_count"] == 1  # S11：兩檢視資料一致
    assert files_resp["items"][0]["set_title"] == "套組"


def test_single_file_download(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    file_id = created["files"][0]["id"]

    resp = client.get(f"/api/admin/teaching-materials/files/{file_id}/download")
    assert resp.status_code == 200
    assert resp.content == b"hello-a"
    assert "a.pdf" in resp.headers["content-disposition"]


def test_batch_download_zip_contains_all_files(client, in_memory_db, mock_nas):
    mt = _seed_type(in_memory_db)
    created = _create_set(client, mt.id)
    client.post(
        f"/api/admin/teaching-materials/sets/{created['id']}/files",
        files=[("files", ("b.pdf", io.BytesIO(b"hello-b"), "application/pdf"))],
    )
    detail = client.get(f"/api/admin/teaching-materials/sets/{created['id']}").json()
    file_ids = [f["id"] for f in detail["files"]]

    resp = client.post(
        "/api/admin/teaching-materials/batch-download",
        json={"file_ids": file_ids},
    )
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert sorted(zf.namelist()) == ["a.pdf", "b.pdf"]
```

- [ ] **Step 3：執行測試確認通過**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_download.py -v
```

Expected: 3 passed.

- [ ] **Step 4：執行完整套組測試套件回歸**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_set_models.py tests/test_teaching_material_sets_migration.py tests/test_teaching_material_sets_api.py tests/test_teaching_material_sets_list.py tests/test_teaching_material_sets_update.py tests/test_teaching_material_sets_files.py tests/test_teaching_material_sets_download.py -v
```

Expected: 全部 passed。

- [ ] **Step 5：Commit**

```bash
git add backend/app/routers/teaching_material_sets.py tests/test_teaching_material_sets_download.py
git commit -m "feat(materials): 新增檔案檢視列表/單檔下載/批次ZIP下載端點"
```

---

> **後端 API 已全數完成（Task 1~7）。以下 Task 8~13 為前端改造；Task 14（移除 Wave1 舊端點）須待前端改造全部完成後才執行，避免中途破壞既有教材上傳/下載功能。**

## Task 8：前端共用型別 `types/materials.ts`

**Files:**
- Create: `frontend/src/types/materials.ts`

**Interfaces:**
- Produces：`MaterialType`, `MaterialFileFormat`, `MaterialSetFile`, `MaterialSet`, `MaterialSetList`, `MaterialFileListItem`, `MaterialFileList`, `SetFileUploadResult`, `ConflictPolicy`（保留型別名沿用舊碼慣例，但 Wave2 語意改為 `overwrite_on_duplicate` 布林，型別本身不再需要）。後續 Task 9~13 皆 import 此檔。

- [ ] **Step 1：建立 `frontend/src/types/materials.ts`**

```typescript
/** 教材套組共用型別（Wave 2）。見教材 PLAN §5.12、§7。 */

export interface MaterialType {
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
}

export interface MaterialFileFormat {
    id: number;
    ext: string;
    label: string;
    sort_order: number;
    max_file_bytes: number | null;
    is_active: boolean;
    mime_types?: string | null;
}

export interface MaterialSetFile {
    id: number;
    original_filename: string;
    file_format: string;
    file_size_bytes: number;
    uploaded_by: string;
    uploaded_at: string;
    is_active: boolean;
}

export interface MaterialSet {
    id: number;
    title: string;
    material_type_id: number;
    description: string | null;
    tags: string | null;
    year: string;
    uploaded_by: string;
    uploaded_at: string;
    is_active: boolean;
    file_count: number;
    plan_ids: number[];
    plan_titles: string[];
    files?: MaterialSetFile[];
}

export interface MaterialSetList {
    items: MaterialSet[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

export interface MaterialFileListItem {
    id: number;
    set_id: number;
    set_title: string;
    original_filename: string;
    file_format: string;
    file_size_bytes: number;
    uploaded_by: string;
    uploaded_at: string;
    is_active: boolean;
    plan_titles: string[];
}

export interface MaterialFileList {
    items: MaterialFileListItem[];
    total: number;
    page: number;
    size: number;
    total_pages: number;
}

export interface SetFileUploadResult {
    succeeded: { id: number; original_filename: string; overwritten?: boolean }[];
    failed: { original_filename: string; reason: string }[];
}

/** 上傳套組建立回應與 SetFileUploadResult 共用此形狀的子集，故沿用 MaterialSet。 */
export interface PlanOption {
    id: number;
    title: string;
    is_archived?: boolean;
}
```

- [ ] **Step 2：驗證型別檔可編譯**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 無錯誤（此階段尚無其他檔案引用，只需確認語法正確）。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/types/materials.ts
git commit -m "feat(materials): 新增教材套組前端共用型別"
```

---

## Task 9：前端共用 API 封裝 `api/teachingMaterials.ts`

**Files:**
- Create: `frontend/src/api/teachingMaterials.ts`

**Interfaces:**
- Consumes：Task 8 的 `types/materials.ts`。
- Produces：`fetchMaterialTypes`, `fetchMaterialFileFormats`, `fetchPlanOptions`, `fetchSets`, `fetchFiles`, `fetchSetDetail`, `createSet`, `updateSet`, `updateSetPlans`, `deleteSet`, `addSetFiles`, `removeSetFile`, `downloadFile`, `batchDownloadFiles`。Task 11~13 皆 import 此檔，不再直接於元件內硬寫 API 路徑字串。

- [ ] **Step 1：建立 `frontend/src/api/teachingMaterials.ts`**

```typescript
import type { AxiosProgressEvent, AxiosResponse } from 'axios';
import api from '../api';
import type {
    MaterialType, MaterialFileFormat, MaterialSet, MaterialSetList,
    MaterialFileList, SetFileUploadResult, PlanOption,
} from '../types/materials';

const BASE = '/admin/teaching-materials';

export interface TransferOpts {
    signal?: AbortSignal;
    onUploadProgress?: (e: AxiosProgressEvent) => void;
    onDownloadProgress?: (e: AxiosProgressEvent) => void;
}

export const fetchMaterialTypes = () =>
    api.get<MaterialType[]>(`${BASE}/material-types`).then(r => r.data);

export const fetchMaterialFileFormats = () =>
    api.get<MaterialFileFormat[]>(`${BASE}/material-file-formats`).then(r => r.data);

/** 訓練計畫選項（供套組綁定計畫多選使用）；僅取用 id/title/is_archived。 */
export const fetchPlanOptions = () =>
    api.get<PlanOption[]>('/training/plans').then(r => r.data);

export interface SetListParams {
    page: number;
    size: number;
    keyword?: string;
    material_type_id?: string;
    file_format?: string;
    plan_id?: number;
}

export const fetchSets = (params: SetListParams) =>
    api.get<MaterialSetList>(`${BASE}/sets`, { params }).then(r => r.data);

export const fetchFiles = (params: SetListParams) =>
    api.get<MaterialFileList>(`${BASE}/files`, { params }).then(r => r.data);

export const fetchSetDetail = (setId: number) =>
    api.get<MaterialSet>(`${BASE}/sets/${setId}`).then(r => r.data);

export const createSet = (fd: FormData, opts: TransferOpts = {}): Promise<AxiosResponse<MaterialSet>> =>
    api.post<MaterialSet>(`${BASE}/sets`, fd, opts);

export const updateSet = (
    setId: number,
    payload: { title?: string; material_type_id?: number; description?: string | null; tags?: string[] | null },
) => api.put<MaterialSet>(`${BASE}/sets/${setId}`, payload).then(r => r.data);

export const updateSetPlans = (setId: number, planIds: number[]) =>
    api.put<MaterialSet>(`${BASE}/sets/${setId}/plans`, { plan_ids: planIds }).then(r => r.data);

export const deleteSet = (setId: number) => api.delete(`${BASE}/sets/${setId}`);

export const addSetFiles = (
    setId: number,
    fd: FormData,
    opts: TransferOpts = {},
): Promise<AxiosResponse<SetFileUploadResult>> =>
    api.post<SetFileUploadResult>(`${BASE}/sets/${setId}/files`, fd, opts);

export const removeSetFile = (setId: number, fileId: number) =>
    api.delete(`${BASE}/sets/${setId}/files/${fileId}`);

export const downloadFile = (fileId: number, token: string, opts: TransferOpts = {}) =>
    api.get(`${BASE}/files/${fileId}/download`, {
        params: { nas_session_token: token },
        responseType: 'blob',
        ...opts,
    });

export const batchDownloadFiles = (fileIds: number[], token: string, opts: TransferOpts = {}) =>
    api.post(
        `${BASE}/batch-download`,
        { file_ids: fileIds, nas_session_token: token },
        { responseType: 'blob', ...opts },
    );
```

- [ ] **Step 2：驗證編譯通過**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 無錯誤。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/api/teachingMaterials.ts
git commit -m "feat(materials): 新增教材套組前端共用 API 封裝"
```

---

## Task 10：前端共用 Hook `hooks/useNasTransfer.ts`

`TeachingMaterialLibrary.tsx`／`PlanMaterialsSection.tsx` 目前各自複製一份「NAS 登入請求（`requireNas`）＋傳輸進度狀態（`TransferState`）＋取消/關閉」邏輯（見 `PlanMaterialsSection.tsx:85-140`、`TeachingMaterialLibrary.tsx:93-185`）。本任務抽成共用 hook，供 Task 12、13 的新元件使用。

**Files:**
- Create: `frontend/src/hooks/useNasTransfer.ts`

**Interfaces:**
- Consumes：`frontend/src/components/teaching/transfer.ts` 既有的 `idleTransfer`, `IN_FLIGHT_PROGRESS_CAP`, `type TransferState`（原樣沿用，不搬移該檔）。
- Produces：`useNasTransfer()` 回傳 `{ nasOpen, nasPurpose, transfer, requireNas, onNasSuccess, closeNasModal, closeTransfer, cancelTransfer, onProgress, isCancel, beginTransfer, endTransferSuccess, endTransferError }`。Task 12、13 皆使用此 hook 取代原本各自的 `useState`/`useRef` 樣板。

- [ ] **Step 1：建立 `frontend/src/hooks/useNasTransfer.ts`**

```typescript
import { useRef, useState } from 'react';
import axios, { type AxiosProgressEvent } from 'axios';
import { idleTransfer, IN_FLIGHT_PROGRESS_CAP, type TransferState } from '../components/teaching/transfer';

/**
 * NAS 登入請求與傳輸進度狀態的共用邏輯（教材套組 Wave 2）。
 * 取代 TeachingMaterialLibrary / PlanMaterialsSection 原本各自重複的
 * requireNas / TransferState / cancelTransfer 樣板。
 */
export function useNasTransfer() {
    const [nasOpen, setNasOpen] = useState(false);
    const [nasPurpose, setNasPurpose] = useState('');
    const pendingActionRef = useRef<((token: string) => void) | null>(null);
    const [transfer, setTransfer] = useState<TransferState>(idleTransfer);
    const abortRef = useRef<AbortController | null>(null);

    const requireNas = (purpose: string, action: (token: string) => void) => {
        pendingActionRef.current = action;
        setNasPurpose(purpose);
        setNasOpen(true);
    };

    const onNasSuccess = (token: string) => {
        setNasOpen(false);
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.(token);
    };

    const closeNasModal = () => setNasOpen(false);
    const closeTransfer = () => setTransfer(idleTransfer);
    const cancelTransfer = () => {
        abortRef.current?.abort();
        setTransfer(idleTransfer);
    };

    const onProgress = (e: AxiosProgressEvent) =>
        setTransfer(s => (s.open
            ? { ...s, progress: e.total ? Math.min(IN_FLIGHT_PROGRESS_CAP, Math.round((e.loaded / e.total) * 100)) : s.progress }
            : s));

    const isCancel = (err: unknown) =>
        axios.isCancel(err) || (err as { code?: string })?.code === 'ERR_CANCELED';

    /** 開始一段傳輸：建立 AbortController、開啟進度視窗，回傳 signal 供呼叫端傳給 axios。 */
    const beginTransfer = (title: string): AbortSignal => {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setTransfer({ open: true, title, progress: 0, status: 'transferring', error: null });
        return ctrl.signal;
    };

    const endTransferSuccess = () => {
        setTransfer(s => ({ ...s, progress: 100, status: 'success' }));
        abortRef.current = null;
    };

    const endTransferError = (message: string) => {
        setTransfer(s => ({ ...s, status: 'error', error: message }));
        abortRef.current = null;
    };

    return {
        nasOpen, nasPurpose, transfer,
        requireNas, onNasSuccess, closeNasModal,
        closeTransfer, cancelTransfer, onProgress, isCancel,
        beginTransfer, endTransferSuccess, endTransferError,
    };
}
```

- [ ] **Step 2：驗證編譯通過**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 無錯誤。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/hooks/useNasTransfer.ts
git commit -m "feat(materials): 抽出 NAS 登入與傳輸進度共用 hook"
```

---

## Task 11：共用元件 `MaterialSetUploadPanel.tsx`（建立套組）

`TeachingMaterialLibrary`（教材庫「上傳教材」）與 `PlanMaterialsSection`（計畫頁「上傳教材」）都需要「填標題/類型/簡述/標籤/選檔→建立套組」的表單，差異只在於是否可選多個訓練計畫、以及是否鎖定當前計畫。抽成一個共用元件，兩處各自傳入不同 props。

**Files:**
- Create: `frontend/src/components/teaching/MaterialSetUploadPanel.tsx`

**Interfaces:**
- Consumes：Task 8 型別、Task 9 `createSet`、Task 10 `useNasTransfer()` 回傳值（由呼叫端傳入，不在元件內自行建立 hook 實例，讓呼叫端能共用同一個 `FileTransferModal`/`NasLoginModal`）、既有 `frontend/src/components/teaching/transfer.ts` 的 `mergeSelectedFiles`、既有 `frontend/src/components/teaching/NasLoginModal.tsx`/`FileTransferModal.tsx`（不變）、既有 `frontend/src/hooks/useMaterialFileFormats.ts`（不變）。
- Produces：`MaterialSetUploadPanel` 元件，props 見下；`onCreated(created: MaterialSet)` callback 供 Task 13/14 重新整理列表。

- [ ] **Step 1：建立 `frontend/src/components/teaching/MaterialSetUploadPanel.tsx`**

```typescript
import { useState } from 'react';
import { Upload, Loader2, FileText, AlertCircle, X } from 'lucide-react';
import { type AxiosError } from 'axios';
import { createSet } from '../../api/teachingMaterials';
import { mergeSelectedFiles } from './transfer';
import type { MaterialType, MaterialSet, PlanOption } from '../../types/materials';

interface MaterialSetUploadPanelProps {
    types: MaterialType[];
    allowedExts: string[];
    materialAccept: string;
    /** 可綁定的訓練計畫選項；不提供或為空陣列時不顯示計畫多選（例如僅通用教材情境）。 */
    planOptions?: PlanOption[];
    /** 提供時鎖定此計畫（固定勾選、無法取消），用於訓練計畫編輯頁上傳。 */
    lockedPlanId?: number;
    onCreated: (created: MaterialSet) => void;
    requireNas: (purpose: string, action: (token: string) => void) => void;
    beginTransfer: (title: string) => AbortSignal;
    onUploadProgress: (e: import('axios').AxiosProgressEvent) => void;
    endTransferSuccess: () => void;
    endTransferError: (message: string) => void;
    isCancel: (err: unknown) => boolean;
}

/** 建立教材套組面板（教材 PLAN §5.12.3：上傳前須 NAS 登入；首批檔案與套組同時建立）。 */
const MaterialSetUploadPanel = ({
    types, allowedExts, materialAccept, planOptions = [], lockedPlanId,
    onCreated, requireNas, beginTransfer, onUploadProgress, endTransferSuccess,
    endTransferError, isCancel,
}: MaterialSetUploadPanelProps) => {
    const [typeId, setTypeId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [planIds, setPlanIds] = useState<number[]>(lockedPlanId ? [lockedPlanId] : []);
    const [files, setFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [resultMsg, setResultMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const doCreate = (token: string) => {
        const fd = new FormData();
        fd.append('title', title || files[0]?.name.replace(/\.[^.]+$/, '') || '未命名教材');
        fd.append('material_type_id', typeId);
        if (description) fd.append('description', description);
        if (tags) fd.append('tags', tags);
        if (planIds.length > 0) fd.append('plan_ids', planIds.join(','));
        fd.append('nas_session_token', token);
        files.forEach(f => fd.append('files', f));

        const signal = beginTransfer('建立教材套組');
        createSet(fd, { signal, onUploadProgress })
            .then(res => {
                endTransferSuccess();
                setResultMsg(`已建立套組「${res.data.title}」（${res.data.file_count} 個檔案）`);
                setTitle('');
                setTypeId('');
                setDescription('');
                setTags('');
                setFiles([]);
                setFileInputKey(k => k + 1);
                if (!lockedPlanId) setPlanIds([]);
                onCreated(res.data);
            })
            .catch(err => {
                if (isCancel(err)) return;
                const e2 = err as AxiosError<{ detail: string }>;
                endTransferError(e2.response?.data?.detail || (e2.response?.status === 503 ? 'NAS 無法連線' : '建立失敗'));
            });
    };

    const handleCreateClick = () => {
        setError(null);
        setResultMsg(null);
        if (!typeId) { setError('請選擇教材類型'); return; }
        if (files.length === 0) { setError('請選擇檔案'); return; }
        setBusy(true);
        requireNas('建立教材套組', token => { doCreate(token); setBusy(false); });
        setBusy(false);
    };

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-indigo-100 space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase">
                新增教材套組（上傳前須 NAS 登入）
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                    value={typeId}
                    onChange={e => setTypeId(e.target.value)}
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold focus:outline-none focus:border-indigo-500"
                >
                    <option value="">選擇教材類型…</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-indigo-300 bg-white rounded-lg text-sm font-bold text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition-colors">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{files.length > 0 ? `已選 ${files.length} 個檔案` : '選擇檔案…'}</span>
                    <input
                        key={fileInputKey}
                        type="file"
                        multiple
                        accept={materialAccept}
                        onChange={e => {
                            const picked = e.target.files ? Array.from(e.target.files) : [];
                            const { merged, rejected, overflow } = mergeSelectedFiles(files, picked, allowedExts);
                            setFiles(merged);
                            setFileInputKey(k => k + 1);
                            if (rejected.length) setError(`不允許的格式：${rejected.join('、')}`);
                            else if (overflow) setError(`單次最多 5 檔，已忽略超出的 ${overflow} 個檔案`);
                            else setError(null);
                        }}
                        className="hidden"
                    />
                </label>
                <input
                    type="text"
                    placeholder="標題（選填，預設使用第一個檔名）"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                />
                <input
                    type="text"
                    placeholder="簡述（選填）"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                />
                <input
                    type="text"
                    placeholder="標籤（逗號分隔，選填）"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    className="px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 md:col-span-2"
                />
                {files.length > 0 && (
                    <ul className="md:col-span-2 text-xs text-gray-600 space-y-0.5">
                        {files.map((f, i) => (
                            <li key={i} className="flex items-center justify-between gap-1 truncate">
                                <span className="truncate">{i + 1}. {f.name}</span>
                                <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                                    className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer shrink-0" title="移除">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {planOptions.length > 0 && (
                    <div className="md:col-span-2 space-y-1">
                        <p className="text-xs text-gray-500">綁定訓練計畫（不選＝通用教材；Ctrl/Cmd+點擊可複選）</p>
                        <select
                            multiple
                            value={planIds.map(String)}
                            onChange={e => {
                                const chosen = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                                setPlanIds(lockedPlanId ? Array.from(new Set([lockedPlanId, ...chosen])) : chosen);
                            }}
                            className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 h-28"
                        >
                            {planOptions.filter(p => !p.is_archived).map(p => (
                                <option key={p.id} value={p.id} disabled={p.id === lockedPlanId}>
                                    {p.title}{p.id === lockedPlanId ? '（本計畫，已鎖定）' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="md:col-span-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">可多選；單次≤5檔</span>
                    <button
                        type="button"
                        onClick={handleCreateClick}
                        disabled={busy}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 cursor-pointer"
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} 建立套組
                    </button>
                </div>
            </div>
            {error && <p className="text-xs text-red-600 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
            {resultMsg && <p className="text-xs text-green-600 font-bold">{resultMsg}</p>}
        </div>
    );
};

export default MaterialSetUploadPanel;
```

- [ ] **Step 2：執行 lint 與型別檢查確認通過**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

Expected: 無錯誤、無警告。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/components/teaching/MaterialSetUploadPanel.tsx
git commit -m "feat(materials): 新增教材套組建立面板共用元件"
```

---

## Task 12：共用元件 `MaterialSetEditPanel.tsx`（編輯套組：中繼資料／計畫綁定／增刪檔案）

編輯套組需要：改標題/類型/簡述/標籤、增刪綁定計畫、列出既有檔案並可移除、新增檔案（同名時詢問覆蓋 Yes/No）。Wave2 移除了 Wave1 的 `conflict-check` 預檢端點，改為：直接呼叫 `addSetFiles`，若回應 `failed[].reason === '同名衝突，需指定是否覆蓋'`，才彈出覆蓋 Yes/No 對話框，針對這些衝突檔重新提交一次帶 `overwrite_on_duplicate` 的請求。

**Files:**
- Create: `frontend/src/components/teaching/MaterialSetEditPanel.tsx`

**Interfaces:**
- Consumes：Task 8 型別、Task 9 `updateSet`/`updateSetPlans`/`removeSetFile`/`addSetFiles`/`fetchSetDetail`、Task 10 `useNasTransfer()` 回傳值（由呼叫端傳入）。
- Produces：`MaterialSetEditPanel` 元件，`onUpdated: (updated: MaterialSet) => void`、`onClose: () => void` callback。

- [ ] **Step 1：建立 `frontend/src/components/teaching/MaterialSetEditPanel.tsx`**

```typescript
import { useState } from 'react';
import { Loader2, FileText, AlertCircle, X, Trash2 } from 'lucide-react';
import { type AxiosError, type AxiosProgressEvent } from 'axios';
import { updateSet, updateSetPlans, removeSetFile, addSetFiles } from '../../api/teachingMaterials';
import { mergeSelectedFiles } from './transfer';
import type { MaterialType, MaterialSet, PlanOption } from '../../types/materials';

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

interface MaterialSetEditPanelProps {
    set: MaterialSet;
    types: MaterialType[];
    allowedExts: string[];
    materialAccept: string;
    planOptions?: PlanOption[];
    lockedPlanId?: number;
    onUpdated: (updated: MaterialSet) => void;
    onClose: () => void;
    requireNas: (purpose: string, action: (token: string) => void) => void;
    beginTransfer: (title: string) => AbortSignal;
    onUploadProgress: (e: AxiosProgressEvent) => void;
    endTransferSuccess: () => void;
    endTransferError: (message: string) => void;
    isCancel: (err: unknown) => boolean;
}

/** 編輯套組面板：中繼資料、計畫綁定、既有檔案移除、新增檔案（同名覆蓋 Yes/No，教材 PLAN §5.12.3）。 */
const MaterialSetEditPanel = ({
    set, types, allowedExts, materialAccept, planOptions = [], lockedPlanId,
    onUpdated, onClose, requireNas, beginTransfer, onUploadProgress,
    endTransferSuccess, endTransferError, isCancel,
}: MaterialSetEditPanelProps) => {
    const [title, setTitle] = useState(set.title);
    const [typeId, setTypeId] = useState(String(set.material_type_id));
    const [description, setDescription] = useState(set.description ?? '');
    const [tags, setTags] = useState(() => {
        try { return ((JSON.parse(set.tags ?? '[]')) as string[]).join(', '); } catch { return ''; }
    });
    const [planIds, setPlanIds] = useState<number[]>(set.plan_ids);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [conflictFiles, setConflictFiles] = useState<File[]>([]);
    const [conflictOpen, setConflictOpen] = useState(false);

    const saveMetadataAndPlans = async () => {
        if (!typeId) { setError('請選擇教材類型'); return; }
        setError(null);
        setBusy(true);
        try {
            const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
            const updated = await updateSet(set.id, {
                title, material_type_id: Number(typeId),
                description: description || null,
                tags: tagsArray.length ? tagsArray : null,
            });
            const withPlans = await updateSetPlans(set.id, planIds);
            onUpdated({ ...updated, plan_ids: withPlans.plan_ids, plan_titles: withPlans.plan_titles });
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            setError(e2.response?.data?.detail || '儲存失敗');
        } finally {
            setBusy(false);
        }
    };

    const handleRemoveFile = async (fileId: number) => {
        if (!confirm('確定移除此檔案？（軟刪除，NAS 實體檔保留）')) return;
        try {
            await removeSetFile(set.id, fileId);
            onUpdated({ ...set, file_count: set.file_count - 1, files: set.files?.filter(f => f.id !== fileId) });
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '移除失敗');
        }
    };

    const submitNewFiles = (files: File[], overwrite?: boolean) => {
        requireNas('新增教材檔案', async token => {
            const fd = new FormData();
            files.forEach(f => fd.append('files', f));
            if (overwrite !== undefined) fd.append('overwrite_on_duplicate', String(overwrite));
            fd.append('nas_session_token', token);

            const signal = beginTransfer('新增教材檔案');
            try {
                const res = await addSetFiles(set.id, fd, { signal, onUploadProgress });
                endTransferSuccess();
                const conflicted = res.data.failed.filter(f => f.reason === '同名衝突，需指定是否覆蓋');
                if (conflicted.length > 0 && overwrite === undefined) {
                    const names = new Set(conflicted.map(f => f.original_filename));
                    setConflictFiles(files.filter(f => names.has(f.name)));
                    setConflictOpen(true);
                } else {
                    setNewFiles([]);
                    setFileInputKey(k => k + 1);
                }
                if (res.data.succeeded.length > 0) {
                    // 內容已變動，交由呼叫端重新抓取詳情（file_count/files 需與後端同步）
                    onUpdated({ ...set });
                }
            } catch (err) {
                if (isCancel(err)) return;
                const e2 = err as AxiosError<{ detail: string }>;
                endTransferError(e2.response?.data?.detail || '新增檔案失敗');
            }
        });
    };

    const resolveConflict = (overwrite: boolean) => {
        setConflictOpen(false);
        submitNewFiles(conflictFiles, overwrite);
        setConflictFiles([]);
    };

    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500 uppercase">編輯套組 — {set.title}</label>
                <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select value={typeId} onChange={e => setTypeId(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm font-bold focus:outline-none focus:border-amber-500">
                    <option value="">選擇教材類型…</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input type="text" placeholder="標題" value={title} onChange={e => setTitle(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                <input type="text" placeholder="簡述（選填）" value={description} onChange={e => setDescription(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                <input type="text" placeholder="標籤（逗號分隔，選填）" value={tags} onChange={e => setTags(e.target.value)}
                    className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500" />

                {planOptions.length > 0 && (
                    <div className="md:col-span-2 space-y-1">
                        <p className="text-xs text-gray-500">綁定訓練計畫（不選＝通用教材；Ctrl/Cmd+點擊可複選）</p>
                        <select
                            multiple
                            value={planIds.map(String)}
                            onChange={e => {
                                const chosen = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                                setPlanIds(lockedPlanId ? Array.from(new Set([lockedPlanId, ...chosen])) : chosen);
                            }}
                            className="w-full px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-500 h-28"
                        >
                            {planOptions.filter(p => !p.is_archived).map(p => (
                                <option key={p.id} value={p.id} disabled={p.id === lockedPlanId}>
                                    {p.title}{p.id === lockedPlanId ? '（本計畫，已鎖定）' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">套組內檔案（{set.files?.length ?? 0} 個）</p>
                    <ul className="border-2 border-gray-100 rounded-lg divide-y divide-gray-200 max-h-48 overflow-y-auto">
                        {(set.files ?? []).map(f => (
                            <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                <span className="text-sm text-gray-700 truncate flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    {f.original_filename}
                                    <span className="text-xs text-gray-400 shrink-0">({fmtSize(f.file_size_bytes)})</span>
                                </span>
                                <button type="button" onClick={() => handleRemoveFile(f.id)}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer shrink-0" title="移除">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-1">新增檔案（選填，同名檔會詢問是否覆蓋）</p>
                    <label className="inline-flex items-center gap-2 px-3 py-2 border-2 border-dashed border-amber-300 bg-white rounded-lg text-sm font-bold text-amber-600 hover:border-amber-500 hover:bg-amber-50 cursor-pointer transition-colors">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span>{newFiles.length > 0 ? `已選 ${newFiles.length} 個檔案` : '選擇檔案…'}</span>
                        <input
                            key={fileInputKey}
                            type="file"
                            multiple
                            accept={materialAccept}
                            className="hidden"
                            onChange={e => {
                                const picked = e.target.files ? Array.from(e.target.files) : [];
                                const { merged, rejected, overflow } = mergeSelectedFiles(newFiles, picked, allowedExts);
                                setNewFiles(merged);
                                setFileInputKey(k => k + 1);
                                if (rejected.length) setError(`不允許的格式：${rejected.join('、')}`);
                                else if (overflow) setError(`單次最多 5 檔，已忽略超出的 ${overflow} 個檔案`);
                                else setError(null);
                            }}
                        />
                    </label>
                    {newFiles.length > 0 && (
                        <button type="button" onClick={() => submitNewFiles(newFiles)}
                            className="ml-2 px-3 py-2 text-sm rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer">
                            上傳新檔案
                        </button>
                    )}
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 cursor-pointer">取消</button>
                    <button type="button" onClick={saveMetadataAndPlans} disabled={busy}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 disabled:bg-amber-300 cursor-pointer">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 儲存
                    </button>
                </div>
            </div>
            {error && <p className="text-xs text-red-600 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}

            {conflictOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
                            <h3 className="font-black text-gray-900">套組內同名檔案</h3>
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-700 space-y-2">
                            <p>下列檔案在此套組已存在同名使用中檔案，是否覆蓋？</p>
                            <ul className="list-disc pl-5 text-xs text-gray-600">
                                {conflictFiles.map(f => <li key={f.name}>{f.name}</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
                            <button type="button" onClick={() => resolveConflict(true)} className="px-3 py-2 text-sm rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer">
                                覆蓋（Yes）
                            </button>
                            <button type="button" onClick={() => resolveConflict(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">
                                跳過（No）
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaterialSetEditPanel;
```

> `onUpdated({ ...set })` 於新增檔案成功後只是通知呼叫端「資料已變動」；呼叫端（Task 13/14）應在收到 `onUpdated` 後重新呼叫 `fetchSetDetail(set.id)` 取得含最新 `files`/`file_count` 的完整資料，而不是直接信任這裡回傳的淺拷貝（`files` 陣列在新增檔案情境下未同步更新）。

- [ ] **Step 2：執行 lint 與型別檢查確認通過**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

Expected: 無錯誤、無警告。

- [ ] **Step 3：Commit**

```bash
git add frontend/src/components/teaching/MaterialSetEditPanel.tsx
git commit -m "feat(materials): 新增教材套組編輯面板共用元件（增刪檔案/計畫綁定）"
```

---

## Task 13：`TeachingMaterialLibrary.tsx` 改為套組／檔案雙檢視

驗收對應：教材 PLAN §5.12.8 S1、S3、S6~S11、S13、S14。移除 Wave1 同名衝突二選一跳窗（`deactivate_and_new`/`replace_in_place`）與 `on_conflict` UI（S14）。

**Files:**
- Modify: `frontend/src/components/teaching/TeachingMaterialLibrary.tsx`（整檔改寫）

**Interfaces:**
- Consumes：Task 8~12 的所有型別、API 封裝、hook、共用元件。
- 勾選語意：**內部一律以 `fileId` 為單位儲存**（`Map<number, {original_filename, set_title}>`）；套組檢視下，勾選「一列（一個 set）」＝勾選該 set 目前所有使用中檔案（`file_count` 個），並以「該套組已勾 X/Y 檔」呈現，避免與批次下載 API（僅接受 `file_ids`）語意不一致。

- [ ] **Step 1：改寫 `frontend/src/components/teaching/TeachingMaterialLibrary.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Library, Search, Download, Trash2, Loader2, CheckSquare, Square, PackageOpen, Upload, Pencil, PenTool, LayoutGrid, FileStack } from 'lucide-react';
import { type AxiosError } from 'axios';
import { PaginatedDataTable, type DataTableColumn } from '@shared-ui/data-table';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, buildMaterialAccept } from './transfer';
import { useMaterialFileFormats } from '../../hooks/useMaterialFileFormats';
import { useNasTransfer } from '../../hooks/useNasTransfer';
import MaterialSetUploadPanel from './MaterialSetUploadPanel';
import MaterialSetEditPanel from './MaterialSetEditPanel';
import {
    fetchMaterialTypes, fetchPlanOptions, fetchSets, fetchFiles, fetchSetDetail,
    deleteSet, downloadFile, batchDownloadFiles,
} from '../../api/teachingMaterials';
import type { MaterialType, MaterialSet, MaterialFileListItem, PlanOption } from '../../types/materials';

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

const TAG_PALETTE = [
    'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700',
];
const parseTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
};
const tagColorClass = (tag: string): string =>
    TAG_PALETTE[tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length];

type ViewMode = 'set' | 'file';
type SelectedEntry = { original_filename: string; set_title: string };

interface TeachingMaterialLibraryProps {
    onBack?: () => void;
}

const TeachingMaterialLibrary = ({ onBack }: TeachingMaterialLibraryProps = {}) => {
    const { allowedExts } = useMaterialFileFormats();
    const materialAccept = buildMaterialAccept(allowedExts);
    const nas = useNasTransfer();

    const [view, setView] = useState<ViewMode>('set');
    const [setItems, setSetItems] = useState<MaterialSet[]>([]);
    const [fileItems, setFileItems] = useState<MaterialFileListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(20);
    const [types, setTypes] = useState<MaterialType[]>([]);
    const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);

    const [keyword, setKeyword] = useState('');
    const [materialTypeId, setMaterialTypeId] = useState('');
    const [fileFormat, setFileFormat] = useState('');
    const [loading, setLoading] = useState(false);

    const [selected, setSelected] = useState<Map<number, SelectedEntry>>(new Map());
    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

    const [uploadOpen, setUploadOpen] = useState(false);
    const [editingSetId, setEditingSetId] = useState<number | null>(null);
    const [editingSet, setEditingSet] = useState<MaterialSet | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, size, keyword: keyword || undefined, material_type_id: materialTypeId || undefined, file_format: fileFormat || undefined };
            if (view === 'set') {
                const res = await fetchSets(params);
                setSetItems(res.items);
                setTotal(res.total);
            } else {
                const res = await fetchFiles(params);
                setFileItems(res.items);
                setTotal(res.total);
            }
        } catch (err) {
            console.error('載入教材庫失敗', err);
        } finally {
            setLoading(false);
        }
    }, [view, page, size, keyword, materialTypeId, fileFormat]);

    useEffect(() => { fetchMaterialTypes().then(setTypes).catch(() => {}); }, []);
    useEffect(() => { fetchPlanOptions().then(setPlanOptions).catch(() => {}); }, []);
    useEffect(() => { fetchList(); }, [fetchList]);

    useEffect(() => {
        if (editingSetId == null) { setEditingSet(null); return; }
        fetchSetDetail(editingSetId).then(setEditingSet).catch(() => setEditingSet(null));
    }, [editingSetId]);

    const onSearch = () => { setPage(1); fetchList(); };
    const switchView = (v: ViewMode) => { setView(v); setPage(1); setSelected(new Map()); };

    const toggleFile = (fileId: number, entry: SelectedEntry) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(fileId)) next.delete(fileId); else next.set(fileId, entry);
            return next;
        });
    };

    /** 套組檢視下勾選整列：需先取得該套組使用中檔案清單（一次性抓詳情）。 */
    const toggleSet = async (s: MaterialSet) => {
        const detail = s.files ? s : await fetchSetDetail(s.id);
        const fileIds = (detail.files ?? []).map(f => f.id);
        const allSelected = fileIds.length > 0 && fileIds.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Map(prev);
            (detail.files ?? []).forEach(f => {
                if (allSelected) next.delete(f.id);
                else next.set(f.id, { original_filename: f.original_filename, set_title: detail.title });
            });
            return next;
        });
    };

    const doSingleDownload = (fileId: number, filename: string) => {
        nas.requireNas('下載教材', async token => {
            const signal = nas.beginTransfer(`下載 ${filename}`);
            try {
                const res = await downloadFile(fileId, token, { signal, onDownloadProgress: nas.onProgress });
                saveBlob(res.data as Blob, filename);
                nas.endTransferSuccess();
            } catch (err) {
                if (nas.isCancel(err)) return;
                const e2 = err as AxiosError;
                nas.endTransferError(e2.response?.status === 503 ? 'NAS 無法連線' : '下載失敗');
            }
        });
    };

    const doBatchDownload = () => {
        const fileIds = Array.from(selected.keys());
        nas.requireNas('批次下載', async token => {
            const signal = nas.beginTransfer(`批次下載 ${fileIds.length} 份`);
            try {
                const res = await batchDownloadFiles(fileIds, token, { signal, onDownloadProgress: nas.onProgress });
                const ts = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
                saveBlob(res.data as Blob, `teaching_materials_${ts}.zip`);
                nas.endTransferSuccess();
                setSelected(new Map());
            } catch (err) {
                if (nas.isCancel(err)) return;
                const e2 = err as AxiosError;
                nas.endTransferError(e2.response?.status === 503 ? 'NAS 無法連線' : '批次下載失敗');
            }
        });
    };

    const handleDeleteSet = async (s: MaterialSet) => {
        if (!confirm(`確定停用套組「${s.title}」？（軟刪除，實體檔保留）`)) return;
        try {
            await deleteSet(s.id);
            fetchList();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '刪除失敗');
        }
    };

    const refreshAfterEdit = () => {
        fetchList();
        if (editingSetId != null) fetchSetDetail(editingSetId).then(setEditingSet).catch(() => {});
    };

    const setColumns: DataTableColumn<MaterialSet>[] = [
        {
            key: 'select', header: '', width: 40,
            render: s => (
                <button type="button" onClick={() => toggleSet(s)} className="text-indigo-600 cursor-pointer">
                    {(s.files ?? []).length > 0 && (s.files ?? []).every(f => selected.has(f.id))
                        ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
        },
        {
            key: 'title', header: '標題',
            render: s => (
                <>
                    <div className="text-sm font-bold text-gray-800 truncate max-w-[280px]">{s.title}</div>
                    {s.description && <div className="text-xs text-gray-400 truncate max-w-[280px]">{s.description}</div>}
                    {parseTags(s.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                            {parseTags(s.tags).map(tag => (
                                <span key={tag} className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tagColorClass(tag)}`}>{tag}</span>
                            ))}
                        </div>
                    )}
                </>
            ),
        },
        { key: 'type', header: '類型', render: s => <span className="text-sm text-gray-600">{types.find(t => t.id === s.material_type_id)?.name || '-'}</span> },
        {
            key: 'plans', header: '計畫',
            render: s => s.plan_titles.length > 0
                ? <span className="text-sm text-gray-600">{s.plan_titles.join('、')}</span>
                : <span className="text-sm text-gray-400">通用</span>,
        },
        { key: 'file_count', header: '檔案數', render: s => <span className="text-sm text-gray-600">{s.file_count}</span> },
        {
            key: 'actions', header: '操作',
            render: s => (
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditingSetId(s.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer" title="編輯">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => handleDeleteSet(s)} className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    const fileColumns: DataTableColumn<MaterialFileListItem>[] = [
        {
            key: 'select', header: '', width: 40,
            render: f => (
                <button type="button" onClick={() => toggleFile(f.id, { original_filename: f.original_filename, set_title: f.set_title })} className="text-indigo-600 cursor-pointer">
                    {selected.has(f.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300" />}
                </button>
            ),
        },
        {
            key: 'filename', header: '檔名 / 所屬套組',
            render: f => (
                <>
                    <div className="text-sm font-bold text-gray-800 truncate max-w-[280px]">{f.original_filename}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[280px]">{f.set_title}</div>
                </>
            ),
        },
        {
            key: 'plans', header: '計畫',
            render: f => f.plan_titles.length > 0
                ? <span className="text-sm text-gray-600">{f.plan_titles.join('、')}</span>
                : <span className="text-sm text-gray-400">通用</span>,
        },
        { key: 'size', header: '大小', render: f => <span className="text-sm text-gray-600">{fmtSize(f.file_size_bytes)}</span> },
        {
            key: 'actions', header: '操作',
            render: f => (
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditingSetId(f.set_id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded cursor-pointer" title="編輯所屬套組">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => doSingleDownload(f.id, f.original_filename)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer" title="下載">
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <Library className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900">教材庫</h1>
                        <p className="text-gray-500 font-medium text-sm">跨計畫搜尋、勾選與批次下載教材（下載前須 NAS 登入）</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button type="button" onClick={onBack} className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 cursor-pointer">
                            <PenTool className="w-4 h-4" /> 返回考卷工坊
                        </button>
                    )}
                    <button type="button" onClick={() => setUploadOpen(o => !o)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">
                        <Upload className="w-4 h-4" /> 新增教材套組
                    </button>
                </div>
            </header>

            {uploadOpen && (
                <MaterialSetUploadPanel
                    types={types} allowedExts={allowedExts} materialAccept={materialAccept} planOptions={planOptions}
                    onCreated={() => { setUploadOpen(false); setPage(1); fetchList(); }}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                />
            )}

            {editingSet && (
                <MaterialSetEditPanel
                    set={editingSet} types={types} allowedExts={allowedExts} materialAccept={materialAccept} planOptions={planOptions}
                    onUpdated={refreshAfterEdit} onClose={() => setEditingSetId(null)}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                />
            )}

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                    <button type="button" onClick={() => switchView('set')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold cursor-pointer ${view === 'set' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
                        <LayoutGrid className="w-3.5 h-3.5" /> 套組檢視
                    </button>
                    <button type="button" onClick={() => switchView('file')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-bold cursor-pointer ${view === 'file' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}>
                        <FileStack className="w-3.5 h-3.5" /> 檔案檢視
                    </button>
                </div>
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="搜尋標題 / 檔名 / 標籤 / 訓練計畫名稱…"
                        className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch()} />
                </div>
                <select value={materialTypeId} onChange={e => { setMaterialTypeId(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部類型</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={fileFormat} onChange={e => { setFileFormat(e.target.value); setPage(1); }} className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                    <option value="">全部格式</option>
                    {allowedExts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button type="button" onClick={onSearch} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">搜尋</button>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">共 {total} 筆{selected.size > 0 ? `；已選 ${selected.size} 個檔案` : ''}</span>
                <button type="button" disabled={selected.size === 0} onClick={() => setBatchConfirmOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer">
                    <PackageOpen className="w-4 h-4" /> 批次下載
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4">
                {view === 'set' ? (
                    <PaginatedDataTable<MaterialSet>
                        adapter="tailwind" columns={setColumns} data={setItems} loading={loading}
                        loadingText={<Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />}
                        emptyState={<div className="text-gray-400">查無教材套組</div>}
                        getRowKey={s => s.id} paginationMode="server" totalItems={total} page={page} pageSize={size}
                        pageSizeOptions={[10, 20, 50, 100]} onPaginationChange={st => { setPage(st.page); setSize(st.pageSize); }}
                    />
                ) : (
                    <PaginatedDataTable<MaterialFileListItem>
                        adapter="tailwind" columns={fileColumns} data={fileItems} loading={loading}
                        loadingText={<Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />}
                        emptyState={<div className="text-gray-400">查無教材檔案</div>}
                        getRowKey={f => f.id} paginationMode="server" totalItems={total} page={page} pageSize={size}
                        pageSizeOptions={[10, 20, 50, 100]} onPaginationChange={st => { setPage(st.page); setSize(st.pageSize); }}
                    />
                )}
            </div>

            {batchConfirmOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-black text-gray-900">批次下載確認（{selected.size} 份）</h3></div>
                        <div className="px-5 py-4 overflow-y-auto">
                            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                                {Array.from(selected.values()).map((v, i) => <li key={i} className="truncate">{v.original_filename}（{v.set_title}）</li>)}
                            </ul>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button type="button" onClick={() => setBatchConfirmOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 cursor-pointer">取消</button>
                            <button type="button" onClick={() => { setBatchConfirmOpen(false); doBatchDownload(); }} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 cursor-pointer">下載 ZIP</button>
                        </div>
                    </div>
                </div>
            )}

            <NasLoginModal open={nas.nasOpen} purpose={nas.nasPurpose} onClose={nas.closeNasModal} onSuccess={nas.onNasSuccess} />
            <FileTransferModal transfer={nas.transfer} onCancel={nas.cancelTransfer} onClose={nas.closeTransfer} />
        </div>
    );
};

export default TeachingMaterialLibrary;
```

- [ ] **Step 2：啟動前後端手動驗證核心流程**

```bash
# 終端機 1
cd backend && export PYTHONPATH=$PYTHONPATH:. && .venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# 終端機 2
cd frontend && npm run dev
```

於瀏覽器開啟教材庫頁面，手動驗證：
1. 「新增教材套組」上傳 2 檔 → 套組檢視顯示 1 列、檔案數 2（S1）。
2. 切換「檔案檢視」→ 應看到 2 列，每列 `set_title` 相同（S11）。
3. 搜尋列輸入一個已綁定計畫的名稱關鍵字 → 應能找到該套組（S10）。
4. 勾選一個套組列（套組檢視）→ 批次下載確認視窗應列出該套組全部檔案 → NAS 登入 → 下載 ZIP 成功。
5. 確認頁面上**不再出現**「停用舊版＋上傳新版 / 以新檔取代舊檔」的同名衝突跳窗（S14）。

- [ ] **Step 3：執行 lint 與型別檢查確認通過**

```bash
cd frontend && npm run lint && npm run build
```

Expected: 無錯誤。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/components/teaching/TeachingMaterialLibrary.tsx
git commit -m "feat(materials): 教材庫改為套組/檔案雙檢視，移除 Wave1 同名衝突跳窗"
```

---

## Task 14：`PlanMaterialsSection.tsx` 改用套組共用元件

驗收對應：教材 PLAN §5.12.8 S9（訓練計畫頁上傳至少綁定該計畫）。

**Files:**
- Modify: `frontend/src/components/teaching/PlanMaterialsSection.tsx`（整檔改寫）

**Interfaces:**
- Consumes：Task 8~12 的所有型別、API 封裝、hook、共用元件。
- `MaterialSetUploadPanel`／`MaterialSetEditPanel` 皆傳入 `lockedPlanId={planId}`，確保建立與編輯時該計畫必定在綁定清單中且無法移除（S9）；`planOptions` 仍傳入完整清單，讓使用者可在此頁「編輯可加其他計畫」。

- [ ] **Step 1：改寫 `frontend/src/components/teaching/PlanMaterialsSection.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Trash2, Pencil } from 'lucide-react';
import { type AxiosError } from 'axios';
import NasLoginModal from './NasLoginModal';
import FileTransferModal from './FileTransferModal';
import { saveBlob, buildMaterialAccept } from './transfer';
import { useMaterialFileFormats } from '../../hooks/useMaterialFileFormats';
import { useNasTransfer } from '../../hooks/useNasTransfer';
import MaterialSetUploadPanel from './MaterialSetUploadPanel';
import MaterialSetEditPanel from './MaterialSetEditPanel';
import {
    fetchMaterialTypes, fetchPlanOptions, fetchSets, fetchSetDetail, deleteSet, downloadFile,
} from '../../api/teachingMaterials';
import type { MaterialType, MaterialSet, PlanOption } from '../../types/materials';

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

const TAG_PALETTE = [
    'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700',
];
const parseTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
};
const tagColorClass = (tag: string): string =>
    TAG_PALETTE[tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_PALETTE.length];

interface PlanMaterialsSectionProps {
    planId: number;
    archived?: boolean;
}

/** 訓練計畫編輯頁的教材區（Wave 2）：套組列表（該計畫綁定）、建立/編輯套組（鎖定本計畫）。 */
const PlanMaterialsSection = ({ planId, archived = false }: PlanMaterialsSectionProps) => {
    const { allowedExts } = useMaterialFileFormats();
    const materialAccept = buildMaterialAccept(allowedExts);
    const nas = useNasTransfer();

    const [types, setTypes] = useState<MaterialType[]>([]);
    const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
    const [sets, setSets] = useState<MaterialSet[]>([]);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [editingSetId, setEditingSetId] = useState<number | null>(null);
    const [editingSet, setEditingSet] = useState<MaterialSet | null>(null);

    /** 列表端點不含 files（見 Task 4 的 _set_to_out 未帶 include_files）；本頁需顯示套組內檔案清單，
     * 故取得清單後對每個 set 額外補一次詳情。計畫頁通常同時掛的套組數量不多，N+1 可接受。 */
    const fetchSetsForPlan = useCallback(async () => {
        try {
            const res = await fetchSets({ page: 1, size: 100, plan_id: planId });
            const withFiles = await Promise.all(res.items.map(s => fetchSetDetail(s.id)));
            setSets(withFiles);
        } catch (err) {
            console.error('載入教材失敗', err);
        }
    }, [planId]);

    useEffect(() => { fetchMaterialTypes().then(setTypes).catch(() => {}); }, []);
    useEffect(() => { fetchPlanOptions().then(setPlanOptions).catch(() => {}); }, []);
    useEffect(() => { fetchSetsForPlan(); }, [fetchSetsForPlan]);

    useEffect(() => {
        if (editingSetId == null) { setEditingSet(null); return; }
        fetchSetDetail(editingSetId).then(setEditingSet).catch(() => setEditingSet(null));
    }, [editingSetId]);

    const refreshAfterEdit = () => {
        fetchSetsForPlan();
        if (editingSetId != null) fetchSetDetail(editingSetId).then(setEditingSet).catch(() => {});
    };

    const doDownload = (fileId: number, filename: string) => {
        nas.requireNas('下載教材', async token => {
            const signal = nas.beginTransfer(`下載 ${filename}`);
            try {
                const res = await downloadFile(fileId, token, { signal, onDownloadProgress: nas.onProgress });
                saveBlob(res.data as Blob, filename);
                nas.endTransferSuccess();
            } catch (err) {
                if (nas.isCancel(err)) return;
                const e2 = err as AxiosError;
                nas.endTransferError(e2.response?.status === 503 ? 'NAS 無法連線' : '下載失敗');
            }
        });
    };

    const handleDelete = async (s: MaterialSet) => {
        if (!confirm(`確定停用套組「${s.title}」？（軟刪除，實體檔保留）`)) return;
        try {
            await deleteSet(s.id);
            fetchSetsForPlan();
        } catch (err) {
            const e2 = err as AxiosError<{ detail: string }>;
            alert(e2.response?.data?.detail || '刪除失敗');
        }
    };

    return (
        <div className="space-y-3 pt-2">
            <label className="text-xs font-bold text-gray-500 uppercase">教材套組（上傳前須 NAS 登入）</label>

            {!archived && (
                uploadOpen ? (
                    <MaterialSetUploadPanel
                        types={types} allowedExts={allowedExts} materialAccept={materialAccept}
                        planOptions={planOptions} lockedPlanId={planId}
                        onCreated={() => { setUploadOpen(false); fetchSetsForPlan(); }}
                        requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                        endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                    />
                ) : (
                    <button type="button" onClick={() => setUploadOpen(true)}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 cursor-pointer">
                        新增教材套組
                    </button>
                )
            )}

            {editingSet && (
                <MaterialSetEditPanel
                    set={editingSet} types={types} allowedExts={allowedExts} materialAccept={materialAccept}
                    planOptions={planOptions} lockedPlanId={planId}
                    onUpdated={refreshAfterEdit} onClose={() => setEditingSetId(null)}
                    requireNas={nas.requireNas} beginTransfer={nas.beginTransfer} onUploadProgress={nas.onProgress}
                    endTransferSuccess={nas.endTransferSuccess} endTransferError={nas.endTransferError} isCancel={nas.isCancel}
                />
            )}

            <div className="border-2 border-gray-100 rounded-xl divide-y divide-gray-300 max-h-100 overflow-y-auto">
                {sets.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">尚無教材</p>
                ) : (
                    sets.map(s => (
                        <div key={s.id} className="px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm text-gray-700 truncate flex flex-col min-w-0">
                                    <span className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                        <span className="font-bold text-gray-800 truncate">{s.title}</span>
                                        <span className="text-xs text-gray-400 shrink-0">（{s.file_count} 個檔案）</span>
                                    </span>
                                    {parseTags(s.tags).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5 pl-6">
                                            {parseTags(s.tags).map(tag => (
                                                <span key={tag} className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${tagColorClass(tag)}`}>{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {!archived && (
                                        <button type="button" onClick={() => setEditingSetId(s.id)} className="p-1 text-gray-500 hover:bg-gray-100 rounded cursor-pointer" title="編輯">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    )}
                                    {!archived && (
                                        <button type="button" onClick={() => handleDelete(s)} className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="停用">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <ul className="pl-6 space-y-0.5">
                                {(s.files ?? []).map(f => (
                                    <li key={f.id} className="flex items-center justify-between gap-2 text-xs text-gray-500">
                                        <span className="truncate">{f.original_filename}（{fmtSize(f.file_size_bytes)}）</span>
                                        <button type="button" onClick={() => doDownload(f.id, f.original_filename)} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer shrink-0" title="下載">
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))
                )}
            </div>

            <NasLoginModal open={nas.nasOpen} purpose={nas.nasPurpose} onClose={nas.closeNasModal} onSuccess={nas.onNasSuccess} />
            <FileTransferModal transfer={nas.transfer} onCancel={nas.cancelTransfer} onClose={nas.closeTransfer} />
        </div>
    );
};

export default PlanMaterialsSection;
```

- [ ] **Step 2：啟動前後端手動驗證核心流程**

於瀏覽器開啟任一訓練計畫編輯頁：
1. 「新增教材套組」上傳檔案（不應出現計畫選擇欄可取消本計畫勾選；本計畫應為鎖定狀態）→ 儲存後列表應立即顯示（S9）。
2. 編輯該套組、新增計畫 B 綁定 → 回到教材庫該套組應顯示計畫 A、B 兩者名稱（S7，與 Task 13 手動驗證呼應）。
3. 下載套組內任一檔案成功。

- [ ] **Step 3：執行 lint 與型別檢查確認通過**

```bash
cd frontend && npm run lint && npm run build
```

Expected: 無錯誤。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/components/teaching/PlanMaterialsSection.tsx
git commit -m "feat(materials): 訓練計畫頁教材區改用套組共用元件，鎖定本計畫綁定"
```

---

## Task 15：移除 Wave1 舊端點（cutover）+ 教材類型／格式主檔的引用檢查涵蓋新表

**前置條件：Task 8~14（前端全部改造）須已完成且驗證通過，才可執行本任務**，否則會立即破壞尚未遷移完成的前端功能。

驗收對應：教材 PLAN §5.12.5「廢止：`on_conflict`、`deactivate_and_new`、`replace_in_place`、`conflict-check`」。

**Files:**
- Modify: `backend/app/routers/teaching_materials.py`（整檔改寫，移除 Wave1 端點，保留類型/格式主檔與 NAS 登入）
- Test: `tests/test_teaching_materials_router_wave1_removed.py`

**Interfaces:**
- 移除：`GET /conflict-check`、`POST /upload`、`GET /by-plan/{plan_id}`、`GET /`（列表）、`GET /{material_id}/download`、`POST /batch-download`、`PUT /{material_id}`、`POST /{material_id}/replace-file`、`DELETE /{material_id}`。
- 保留並沿用：`/material-types`、`/material-file-formats`（CRUD）、`/nas-session/verify`；`_client_ip, _normalize_ext, _validate_filename, _effective_max_bytes, _parse_tags, _resolve_credentials, _content_disposition`（供 `teaching_material_sets.py` import，簽名不變）。
- 更新：教材類型／格式刪除的「已有教材引用」檢查，除原本查 `models.TeachingMaterial` 外，**加查** `models.TeachingMaterialSet`／`models.TeachingMaterialFile`，避免 Wave2 套組仍在使用某類型/格式時被誤刪。

- [ ] **Step 1：改寫 `backend/app/routers/teaching_materials.py`**

```python
"""
教材類型／允許格式主檔維護 + NAS 登入路由 (Teaching Materials Router)

Wave2 起，教材本體（套組/檔案/計畫綁定）已全面改由 teaching_material_sets.py 提供
（`/admin/teaching-materials/sets`、`/files` 系列端點）。本檔僅保留：
- 教材類型／允許格式主檔 CRUD（`material-types`、`material-file-formats`）
- NAS 登入短時 token（`nas-session/verify`）
- 供 teaching_material_sets.py 匯入的共用小工具（副檔名驗證、單檔上限計算、NAS 憑證解析、
  Content-Disposition、client IP、tags 解析）

Wave1 資料表 `teaching_materials` 保留於資料庫供歷史查證，但不再有任何寫入路徑；
既有資料已由 backend/migrations/add_teaching_material_sets.py 遷移至 Wave2 三表。
準據：教材 PLAN（20260617）§5.12.5（廢止 on_conflict／conflict-check／replace_in_place／
deactivate_and_new）。
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple
import os
import json
from urllib.parse import quote

from .. import models, schemas
from ..database import get_db
from ..config import get_settings
from .auth import check_permission
from ..services import storage, nas_session

router = APIRouter(prefix="/admin/teaching-materials", tags=["teaching-materials"])

# 危險副檔名（雙副檔名防禦；維持程式常數，不可由 UI 關閉）
DANGEROUS_EXTS = {"exe", "bat", "cmd", "sh", "js", "com", "scr", "msi", "zip", "rar", "7z", "jar", "ps1", "vbs"}


# ----------------------------------------------------------------
# 共用小工具（供 teaching_material_sets.py 匯入）
# ----------------------------------------------------------------

def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real
    return request.client.host if request.client else None


def _normalize_ext(ext: str) -> str:
    """副檔名正規化：小寫、去除前導點與空白。"""
    return (ext or "").strip().lower().lstrip(".")


def _validate_filename(filename: str, db: Session) -> Tuple[str, models.MaterialFileFormat]:
    """驗證副檔名白名單（DB）與雙副檔名；回傳 (小寫副檔名, 格式主檔)。"""
    base = os.path.basename(filename or "")
    parts = base.lower().split(".")
    if len(parts) < 2 or not parts[0]:
        raise ValueError("檔名缺少副檔名")
    ext = parts[-1]
    fmt = db.query(models.MaterialFileFormat).filter(
        models.MaterialFileFormat.ext == ext,
        models.MaterialFileFormat.is_active == True,  # noqa: E712
    ).first()
    if not fmt:
        raise ValueError(f"不允許的格式 .{ext}")
    if any(p in DANGEROUS_EXTS for p in parts[1:-1]):
        raise ValueError("可疑的雙副檔名")
    return ext, fmt


def _effective_max_bytes(
    mt: Optional[models.MaterialType],
    fmt: Optional[models.MaterialFileFormat],
) -> int:
    """有效單檔上限 = min(格式上限, 類型上限, 系統硬上限)。"""
    hard = get_settings().teaching_material_max_file_bytes
    caps = [hard]
    if mt and mt.max_file_bytes:
        caps.append(mt.max_file_bytes)
    if fmt and fmt.max_file_bytes:
        caps.append(fmt.max_file_bytes)
    return min(caps)


def _parse_tags(tags_raw: Optional[str]) -> Optional[str]:
    """tags 接受 JSON 陣列字串或逗號分隔；回傳 JSON 字串或 None。"""
    if not tags_raw:
        return None
    try:
        val = json.loads(tags_raw)
        if isinstance(val, list):
            return json.dumps([str(t) for t in val], ensure_ascii=False)
    except (ValueError, TypeError):
        pass
    parts = [t.strip() for t in tags_raw.split(",") if t.strip()]
    return json.dumps(parts, ensure_ascii=False) if parts else None


def _resolve_credentials(
    nas_session_token: Optional[str],
    nas_username: Optional[str],
    nas_password: Optional[str],
) -> storage.SmbCredentials:
    """由 session token（優先）或當次帳密解析 interactive credentials。"""
    if nas_session_token:
        creds = nas_session.get_credentials(nas_session_token)
        if not creds:
            raise HTTPException(status_code=401, detail="NAS 連線階段已逾時，請重新登入 NAS")
        return creds
    if nas_username and nas_password:
        try:
            return storage.interactive_credentials(nas_username, nas_password)
        except storage.StorageUnavailable as e:
            raise HTTPException(status_code=503, detail=str(e))
    raise HTTPException(status_code=401, detail="教材傳輸前需先進行 NAS 登入")


def _content_disposition(filename: str) -> str:
    """RFC 5987：支援中文檔名的 Content-Disposition。"""
    return f"attachment; filename*=UTF-8''{quote(filename)}"


def _material_type_in_use(db: Session, type_id: int) -> bool:
    """教材類型是否仍被 Wave1 舊表或 Wave2 套組引用（供刪除前檢查）。"""
    return bool(
        db.query(models.TeachingMaterial).filter(models.TeachingMaterial.material_type_id == type_id).first()
        or db.query(models.TeachingMaterialSet).filter(models.TeachingMaterialSet.material_type_id == type_id).first()
    )


def _file_format_in_use(db: Session, ext: str) -> bool:
    """允許格式是否仍被 Wave1 舊表或 Wave2 檔案引用（供刪除前檢查）。"""
    return bool(
        db.query(models.TeachingMaterial).filter(models.TeachingMaterial.file_format == ext).first()
        or db.query(models.TeachingMaterialFile).filter(models.TeachingMaterialFile.file_format == ext).first()
    )


# ----------------------------------------------------------------
# 教材類型維護（material-types）—— GET 需 menu:exam；異動需 menu:admin
# ----------------------------------------------------------------

@router.get("/material-types", response_model=List[schemas.MaterialType])
def list_material_types(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    q = db.query(models.MaterialType)
    if not include_inactive:
        q = q.filter(models.MaterialType.is_active == True)  # noqa: E712
    return q.order_by(models.MaterialType.sort_order.asc(), models.MaterialType.id.asc()).all()


@router.post("/material-types", response_model=schemas.MaterialType)
def create_material_type(
    payload: schemas.MaterialTypeCreate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    if db.query(models.MaterialType).filter(
        (models.MaterialType.name == payload.name) | (models.MaterialType.slug == payload.slug)
    ).first():
        raise HTTPException(status_code=400, detail="類型名稱或 slug 已存在")
    mt = models.MaterialType(**payload.model_dump())
    db.add(mt)
    db.commit()
    db.refresh(mt)
    return mt


@router.put("/material-types/{type_id}", response_model=schemas.MaterialType)
def update_material_type(
    type_id: int,
    payload: schemas.MaterialTypeUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    mt = db.query(models.MaterialType).filter(models.MaterialType.id == type_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="教材類型不存在")
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != mt.slug:
        if _material_type_in_use(db, type_id):
            raise HTTPException(status_code=400, detail="類型已有教材引用，不可修改 slug")
        if db.query(models.MaterialType).filter(
            models.MaterialType.slug == data["slug"],
            models.MaterialType.id != type_id,
        ).first():
            raise HTTPException(status_code=400, detail="slug 已存在")
    if "name" in data and data["name"] != mt.name:
        if db.query(models.MaterialType).filter(
            models.MaterialType.name == data["name"],
            models.MaterialType.id != type_id,
        ).first():
            raise HTTPException(status_code=400, detail="類型名稱已存在")
    for k, v in data.items():
        setattr(mt, k, v)
    db.commit()
    db.refresh(mt)
    return mt


@router.delete("/material-types/{type_id}")
def delete_material_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    mt = db.query(models.MaterialType).filter(models.MaterialType.id == type_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="教材類型不存在")
    if _material_type_in_use(db, type_id):
        mt.is_active = False
        db.commit()
        return {"message": "類型已有教材引用，已改為停用", "disabled": True}
    db.delete(mt)
    db.commit()
    return {"message": "已刪除"}


# ----------------------------------------------------------------
# 允許檔案格式維護（material-file-formats）—— GET 需 menu:exam；異動需 menu:admin
# ----------------------------------------------------------------

@router.get("/material-file-formats", response_model=List[schemas.MaterialFileFormat])
def list_material_file_formats(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=check_permission("menu:exam"),
):
    q = db.query(models.MaterialFileFormat)
    if not include_inactive:
        q = q.filter(models.MaterialFileFormat.is_active == True)  # noqa: E712
    return q.order_by(
        models.MaterialFileFormat.sort_order.asc(),
        models.MaterialFileFormat.id.asc(),
    ).all()


@router.post("/material-file-formats", response_model=schemas.MaterialFileFormat)
def create_material_file_format(
    payload: schemas.MaterialFileFormatCreate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    ext = _normalize_ext(payload.ext)
    if not ext:
        raise HTTPException(status_code=400, detail="副檔名不可為空")
    if db.query(models.MaterialFileFormat).filter(models.MaterialFileFormat.ext == ext).first():
        raise HTTPException(status_code=400, detail="副檔名已存在")
    data = payload.model_dump()
    data["ext"] = ext
    fmt = models.MaterialFileFormat(**data)
    db.add(fmt)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.put("/material-file-formats/{format_id}", response_model=schemas.MaterialFileFormat)
def update_material_file_format(
    format_id: int,
    payload: schemas.MaterialFileFormatUpdate,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    fmt = db.query(models.MaterialFileFormat).filter(
        models.MaterialFileFormat.id == format_id
    ).first()
    if not fmt:
        raise HTTPException(status_code=404, detail="檔案格式不存在")
    data = payload.model_dump(exclude_unset=True)
    if "ext" in data:
        new_ext = _normalize_ext(data["ext"])
        if not new_ext:
            raise HTTPException(status_code=400, detail="副檔名不可為空")
        if new_ext != fmt.ext:
            if _file_format_in_use(db, fmt.ext):
                raise HTTPException(status_code=400, detail="格式已有教材引用，不可修改副檔名")
            if db.query(models.MaterialFileFormat).filter(
                models.MaterialFileFormat.ext == new_ext,
                models.MaterialFileFormat.id != format_id,
            ).first():
                raise HTTPException(status_code=400, detail="副檔名已存在")
        data["ext"] = new_ext
    for k, v in data.items():
        setattr(fmt, k, v)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.delete("/material-file-formats/{format_id}")
def delete_material_file_format(
    format_id: int,
    db: Session = Depends(get_db),
    current_user=check_permission("menu:admin"),
):
    fmt = db.query(models.MaterialFileFormat).filter(
        models.MaterialFileFormat.id == format_id
    ).first()
    if not fmt:
        raise HTTPException(status_code=404, detail="檔案格式不存在")
    if _file_format_in_use(db, fmt.ext):
        fmt.is_active = False
        db.commit()
        return {"message": "格式已有教材引用，已改為停用", "disabled": True}
    db.delete(fmt)
    db.commit()
    return {"message": "已刪除"}


# ----------------------------------------------------------------
# NAS 登入（短時 session token）
# ----------------------------------------------------------------

@router.post("/nas-session/verify", response_model=schemas.NasSessionVerifyResponse)
def verify_nas_session(
    payload: schemas.NasSessionVerifyRequest,
    current_user=check_permission("menu:exam"),
):
    """驗證 NAS 帳密並回傳短時 token；密碼僅存記憶體、不入 DB。"""
    try:
        creds = storage.interactive_credentials(payload.nas_username, payload.nas_password)
        storage.verify_credentials(creds)
    except storage.StorageUnavailable as e:
        raise HTTPException(status_code=401, detail=f"NAS 登入失敗：{e}")
    token, ttl = nas_session.create_session(creds)
    return {"nas_session_token": token, "expires_in": ttl}
```

- [ ] **Step 2：寫測試 `tests/test_teaching_materials_router_wave1_removed.py`**

```python
"""確認 Wave1 舊端點已移除，且教材類型/格式刪除檢查涵蓋 Wave2 套組。"""
import io

from app.models import MaterialType, MaterialFileFormat


def test_wave1_endpoints_are_gone(client):
    assert client.get("/api/admin/teaching-materials/conflict-check", params={"original_filename": "a.pdf"}).status_code == 404
    assert client.post("/api/admin/teaching-materials/upload").status_code == 404
    assert client.get("/api/admin/teaching-materials/by-plan/1").status_code == 404
    assert client.get("/api/admin/teaching-materials/").status_code == 404
    assert client.get("/api/admin/teaching-materials/1/download").status_code == 404
    assert client.post("/api/admin/teaching-materials/batch-download", json={"ids": [1]}).status_code == 404
    assert client.put("/api/admin/teaching-materials/1", json={}).status_code == 404
    assert client.post("/api/admin/teaching-materials/1/replace-file").status_code == 404
    assert client.delete("/api/admin/teaching-materials/1").status_code == 404


def test_material_type_delete_blocked_when_used_by_wave2_set(client, in_memory_db, mock_nas):
    mt = MaterialType(name="操作手冊", slug="opm", is_active=True)
    in_memory_db.add(mt)
    in_memory_db.add(MaterialFileFormat(ext="pdf", label="PDF", is_active=True))
    in_memory_db.commit()

    resp = client.post(
        "/api/admin/teaching-materials/sets",
        data={"title": "套組", "material_type_id": str(mt.id)},
        files=[("files", ("a.pdf", io.BytesIO(b"x"), "application/pdf"))],
    )
    assert resp.status_code == 200, resp.text

    resp = client.delete(f"/api/admin/teaching-materials/material-types/{mt.id}")
    assert resp.status_code == 200
    assert resp.json()["disabled"] is True  # 改為停用，而非硬刪


def test_material_type_delete_succeeds_when_unused(client, in_memory_db):
    mt = MaterialType(name="未使用類型", slug="unused", is_active=True)
    in_memory_db.add(mt)
    in_memory_db.commit()

    resp = client.delete(f"/api/admin/teaching-materials/material-types/{mt.id}")
    assert resp.status_code == 200
    assert resp.json()["message"] == "已刪除"
```

- [ ] **Step 3：執行完整回歸測試**

```bash
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_set_models.py tests/test_teaching_material_sets_migration.py tests/test_teaching_material_sets_api.py tests/test_teaching_material_sets_list.py tests/test_teaching_material_sets_update.py tests/test_teaching_material_sets_files.py tests/test_teaching_material_sets_download.py tests/test_teaching_materials_router_wave1_removed.py -v
```

Expected: 全部 passed。同時建議跑一次整個 `tests/` 目錄，確認未影響既有其他模組：

```bash
backend/.venv/bin/python3 -m pytest tests/ -v
```

- [ ] **Step 4：全站建置驗證**

```bash
cd frontend && npm run lint && npm run build
```

Expected: 無錯誤（`TeachingMaterialLibrary.tsx`／`PlanMaterialsSection.tsx` 已在 Task 13/14 改用新端點，不再呼叫本任務移除的舊路徑）。

- [ ] **Step 5：Commit**

```bash
git add backend/app/routers/teaching_materials.py tests/test_teaching_materials_router_wave1_removed.py
git commit -m "refactor(materials): 移除 Wave1 舊端點(cutover)，類型/格式引用檢查涵蓋 Wave2 套組"
```

---

## 完成後續事項（不在本 PLAN 任務範圍，執行完 Task 1~15 後請與使用者確認）

1. **正式環境遷移**：部署前於正式庫執行 `backend/migrations/add_teaching_material_sets.py`（備份 DB 後）；確認 Wave1 資料筆數與遷移後 `teaching_material_sets`/`files`/`set_plans` 筆數對得上（教材 PLAN §8 風險項）。
2. **`1.docs/02-棕地專案/plans/已完成/20260617_教材上傳列管與教材庫_PLAN.md` 狀態更新**：Wave 2 實作完成後，將文件頂部「📋 Wave 2：待實作」改為「✅ Wave 2：已實作」，並視需要移動到 `已完成/` 目錄（依專案既有命名慣例，見 CLAUDE.md 文件同步規範）。
3. **`1.docs/00-專案總覽/資料庫結構分析/education_training_db_結構分析.md`**：補上 `teaching_material_sets`／`teaching_material_files`／`teaching_material_set_plans` 三張表的結構說明（CLAUDE.md「資料庫操作」章節要求）。

