"""
新增 file_transfer_audit_logs 表（檔案傳輸稽核，見建議事項 PLAN §7.1）。

執行方式：於 backend 目錄下執行 python migrations/add_file_transfer_audit_logs.py

備註：應用啟動時 Base.metadata.create_all 亦會建立缺少的表；本腳本供既有資料庫
明確、可重複執行之遷移（CREATE TABLE IF NOT EXISTS）。執行前請先備份資料庫。
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS file_transfer_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME,
    emp_id VARCHAR,
    client_ip VARCHAR,
    nas_username VARCHAR,
    action VARCHAR,
    resource_type VARCHAR,
    resource_id INTEGER,
    plan_id INTEGER,
    filename VARCHAR,
    bytes INTEGER,
    status VARCHAR,
    error_message TEXT
)
"""


def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(CREATE_SQL)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_ftal_created_at ON file_transfer_audit_logs (created_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_ftal_emp_id ON file_transfer_audit_logs (emp_id)"
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
