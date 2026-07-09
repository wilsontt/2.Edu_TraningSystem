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
