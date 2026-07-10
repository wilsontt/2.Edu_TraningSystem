"""
為 exam_retake_authorizations 新增 consumed_history_id，
並盡量回填既有已消耗授權與 exam_history 的對應。

執行方式：
    cd backend
    .venv/bin/python3 migrations/add_retake_auth_consumed_history_id.py

⚠️ 執行前請備份 data/education_training.db。
"""
import os
import sqlite3

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
        cursor.execute("PRAGMA table_info(exam_retake_authorizations)")
        existing_columns = {row[1] for row in cursor.fetchall()}
        if "consumed_history_id" not in existing_columns:
            cursor.execute(
                "ALTER TABLE exam_retake_authorizations "
                "ADD COLUMN consumed_history_id INTEGER REFERENCES exam_history(id)"
            )
            print("exam_retake_authorizations.consumed_history_id 欄位已新增。")
        else:
            print("exam_retake_authorizations.consumed_history_id 欄位已存在，跳過。")

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_retake_auth_consumed_history
                ON exam_retake_authorizations(consumed_history_id)
        """)
        print("idx_retake_auth_consumed_history 索引已建立（或已存在）。")

        # 回填：已消耗但尚未綁 history 的授權列
        cursor.execute("""
            SELECT id, record_id, consumed_at
            FROM exam_retake_authorizations
            WHERE consumed_at IS NOT NULL
              AND consumed_history_id IS NULL
        """)
        pending = cursor.fetchall()
        backfilled = 0
        for auth_id, record_id, consumed_at in pending:
            cursor.execute(
                """
                SELECT id FROM exam_history
                WHERE record_id = ?
                ORDER BY ABS(strftime('%s', submit_time) - strftime('%s', ?)) ASC,
                         id DESC
                LIMIT 1
                """,
                (record_id, consumed_at),
            )
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    "UPDATE exam_retake_authorizations SET consumed_history_id = ? WHERE id = ?",
                    (row[0], auth_id),
                )
                backfilled += 1
        print(f"既有授權回填完成：{backfilled}/{len(pending)} 筆。")

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
