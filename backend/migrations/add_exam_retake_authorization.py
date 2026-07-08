"""
新增「已通過授權重考」所需的資料庫結構：
  1. 新表 exam_retake_authorizations（授權紀錄）
  2. exam_records 新增 retake_authorized 欄位
  3. system_functions 新增 btn:exam:authorize-retake 功能碼

執行方式：
    cd backend
    .venv/bin/python3 migrations/add_exam_retake_authorization.py

⚠️ 執行前請備份 data/education_training.db。
"""
import sqlite3
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")


def run():
    if not os.path.exists(db_path):
        print(f"找不到資料庫：{db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # ── 1a. 新建 exam_retake_authorizations 表（冪等）──────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS exam_retake_authorizations (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id      INTEGER NOT NULL REFERENCES exam_records(id),
                authorized_by  VARCHAR NOT NULL,
                authorized_at  DATETIME NOT NULL,
                reason         TEXT NOT NULL,
                consumed_at    DATETIME,
                revoked_at     DATETIME,
                revoked_by     VARCHAR
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_retake_auth_record_id
                ON exam_retake_authorizations(record_id)
        """)
        print("exam_retake_authorizations 表已建立（或已存在）。")

        # ── 1b. exam_records 新增 retake_authorized 欄位（冪等）───────────
        cursor.execute("PRAGMA table_info(exam_records)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        if "retake_authorized" not in existing_columns:
            cursor.execute(
                "ALTER TABLE exam_records ADD COLUMN retake_authorized BOOLEAN DEFAULT 0"
            )
            print("exam_records.retake_authorized 欄位已新增。")
        else:
            print("exam_records.retake_authorized 欄位已存在，跳過。")

        # ── 1c. 新增 btn:exam:authorize-retake 功能碼（冪等）──────────────
        cursor.execute("""
            INSERT INTO system_functions (name, code, path, parent_id)
            SELECT '開放重考', 'btn:exam:authorize-retake', NULL,
                   (SELECT id FROM system_functions WHERE code = 'menu:report')
            WHERE NOT EXISTS (
                SELECT 1 FROM system_functions WHERE code = 'btn:exam:authorize-retake'
            )
        """)
        if cursor.rowcount > 0:
            print("btn:exam:authorize-retake 功能碼已新增。")
        else:
            print("btn:exam:authorize-retake 功能碼已存在，跳過。")

        conn.commit()
        print("Migration 完成。")
    except Exception as e:
        conn.rollback()
        print(f"Migration 失敗：{e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
