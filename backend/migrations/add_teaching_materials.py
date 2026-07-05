"""
新增 material_types 與 teaching_materials 表，並植入預設教材類型（Wave 3）。

執行方式：於 backend 目錄下執行 python migrations/add_teaching_materials.py

備註：應用啟動時 Base.metadata.create_all 亦會建立缺少的表；本腳本供既有資料庫
明確、可重複執行之遷移（CREATE TABLE IF NOT EXISTS + 冪等植入）。執行前請先備份資料庫。
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")

CREATE_MATERIAL_TYPES = """
CREATE TABLE IF NOT EXISTS material_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR UNIQUE,
    slug VARCHAR UNIQUE,
    sort_order INTEGER DEFAULT 0,
    max_file_bytes INTEGER,
    is_active BOOLEAN DEFAULT 1
)
"""

CREATE_TEACHING_MATERIALS = """
CREATE TABLE IF NOT EXISTS teaching_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER,
    title VARCHAR,
    material_type_id INTEGER,
    description VARCHAR,
    tags TEXT,
    original_filename VARCHAR,
    stored_filename VARCHAR,
    storage_path VARCHAR,
    file_format VARCHAR,
    file_size_bytes INTEGER,
    year VARCHAR,
    sub_category_id INTEGER,
    uploaded_by VARCHAR,
    uploaded_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    deactivated_at DATETIME,
    deactivated_by VARCHAR,
    replaced_by_id INTEGER,
    replaces_id INTEGER
)
"""

DEFAULT_TYPES = [
    ("操作手冊", "操作手冊", 52428800, 10),
    ("維護手冊", "維護手冊", 52428800, 20),
    ("法規與標準", "法規與標準", 31457280, 30),
    ("公告通知", "公告通知", 31457280, 40),
    ("簡報教材", "簡報教材", 20971520, 50),
    ("測驗參考", "測驗參考", 20971520, 60),
    ("其他", "其他", 20971520, 99),
]


def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(CREATE_MATERIAL_TYPES)
        cursor.execute(CREATE_TEACHING_MATERIALS)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_tm_plan_active ON teaching_materials (plan_id, is_active)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_tm_uploaded_at ON teaching_materials (uploaded_at)"
        )
        for name, slug, max_bytes, order in DEFAULT_TYPES:
            cursor.execute("SELECT 1 FROM material_types WHERE slug = ?", (slug,))
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO material_types (name, slug, max_file_bytes, sort_order, is_active) "
                    "VALUES (?, ?, ?, ?, 1)",
                    (name, slug, max_bytes, order),
                )
        conn.commit()
        print("Migration completed successfully.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
