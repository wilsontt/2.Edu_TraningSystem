"""
新增 backup_schedule_config 與 backup_records 表，並植入預設單例設定（Wave 4）。

執行方式：於 backend 目錄下執行 python migrations/add_backup_schedule.py

備註：應用啟動時 Base.metadata.create_all 亦會建立缺少的表；本腳本供既有資料庫
明確、可重複執行之遷移（CREATE TABLE IF NOT EXISTS + 冪等植入）。執行前請先備份資料庫。
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")

CREATE_BACKUP_SCHEDULE_CONFIG = """
CREATE TABLE IF NOT EXISTS backup_schedule_config (
    id INTEGER PRIMARY KEY,
    enabled BOOLEAN DEFAULT 0,
    frequency VARCHAR DEFAULT 'daily',
    time_of_day VARCHAR DEFAULT '02:00',
    weekday INTEGER,
    retention_count INTEGER DEFAULT 7,
    destination VARCHAR,
    backup_nas_username VARCHAR,
    backup_nas_password_encrypted TEXT,
    updated_at DATETIME
)
"""

CREATE_BACKUP_RECORDS = """
CREATE TABLE IF NOT EXISTS backup_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename VARCHAR,
    created_at DATETIME,
    size_bytes INTEGER,
    status VARCHAR,
    message VARCHAR,
    duration_ms INTEGER
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
        cursor.execute(CREATE_BACKUP_SCHEDULE_CONFIG)
        cursor.execute(CREATE_BACKUP_RECORDS)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS ix_backup_records_created_at ON backup_records (created_at)"
        )
        cursor.execute("SELECT 1 FROM backup_schedule_config WHERE id = 1")
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO backup_schedule_config "
                "(id, enabled, frequency, time_of_day, retention_count) "
                "VALUES (1, 0, 'daily', '02:00', 7)"
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
