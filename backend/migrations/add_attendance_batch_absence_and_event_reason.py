"""
遷移：批次層未到原因表＋報到歷程事件擴充欄位。

新增：
  - attendance_batch_absence_reasons

擴充 attendance_checkin_events：
  - reason_code / reason_text / operator_emp_id

執行：
  cd <專案根目錄>
  python backend/migrations/add_attendance_batch_absence_and_event_reason.py

冪等：可重複執行。
"""
import os
import sqlite3

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")


def _table_exists(cursor: sqlite3.Cursor, name: str) -> bool:
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    )
    return cursor.fetchone() is not None


def _column_exists(cursor: sqlite3.Cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def run_migration() -> None:
    if not os.path.exists(db_path):
        print(f"[skip] Database not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        if not _table_exists(cursor, "attendance_batch_absence_reasons"):
            cursor.execute(
                """
                CREATE TABLE attendance_batch_absence_reasons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    batch_id TEXT NOT NULL,
                    emp_id TEXT NOT NULL,
                    reason_code TEXT NOT NULL,
                    reason_text TEXT,
                    recorded_by TEXT NOT NULL,
                    recorded_at DATETIME,
                    FOREIGN KEY (batch_id) REFERENCES attendance_checkin_batches(id),
                    FOREIGN KEY (emp_id) REFERENCES users(emp_id),
                    FOREIGN KEY (recorded_by) REFERENCES users(emp_id),
                    UNIQUE (batch_id, emp_id)
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS ix_batch_absence_batch_emp "
                "ON attendance_batch_absence_reasons(batch_id, emp_id)"
            )
            print("  [attendance_batch_absence_reasons] 已建立")
        else:
            print("  [attendance_batch_absence_reasons] 已存在（跳過）")

        if _table_exists(cursor, "attendance_checkin_events"):
            for col, ddl in (
                ("reason_code", "ALTER TABLE attendance_checkin_events ADD COLUMN reason_code TEXT"),
                ("reason_text", "ALTER TABLE attendance_checkin_events ADD COLUMN reason_text TEXT"),
                ("operator_emp_id", "ALTER TABLE attendance_checkin_events ADD COLUMN operator_emp_id TEXT"),
            ):
                if not _column_exists(cursor, "attendance_checkin_events", col):
                    cursor.execute(ddl)
                    print(f"  [attendance_checkin_events.{col}] 已新增")
                else:
                    print(f"  [attendance_checkin_events.{col}] 已存在（跳過）")
        else:
            print("  [attendance_checkin_events] 不存在（請先執行 add_attendance_checkin_batch_and_events.py）")

        conn.commit()
        print("\n[done] 遷移完成。")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
