"""
遷移：合併報到批次與報到歷程事件表。

新增：
  - attendance_checkin_batches
  - attendance_checkin_batch_plans
  - attendance_checkin_events

執行：
  cd <專案根目錄>
  python backend/migrations/add_attendance_checkin_batch_and_events.py

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


def run_migration() -> None:
    if not os.path.exists(db_path):
        print(f"[skip] Database not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        if not _table_exists(cursor, "attendance_checkin_batches"):
            cursor.execute(
                """
                CREATE TABLE attendance_checkin_batches (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    training_date DATE NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_by TEXT NOT NULL,
                    created_at DATETIME,
                    closed_at DATETIME,
                    closed_by TEXT,
                    reopened_at DATETIME,
                    reopened_by TEXT,
                    FOREIGN KEY (created_by) REFERENCES users(emp_id),
                    FOREIGN KEY (closed_by) REFERENCES users(emp_id),
                    FOREIGN KEY (reopened_by) REFERENCES users(emp_id)
                )
                """
            )
            print("  [attendance_checkin_batches] 已建立")
        else:
            print("  [attendance_checkin_batches] 已存在（跳過）")

        if not _table_exists(cursor, "attendance_checkin_batch_plans"):
            cursor.execute(
                """
                CREATE TABLE attendance_checkin_batch_plans (
                    batch_id TEXT NOT NULL,
                    plan_id INTEGER NOT NULL,
                    PRIMARY KEY (batch_id, plan_id),
                    FOREIGN KEY (batch_id) REFERENCES attendance_checkin_batches(id),
                    FOREIGN KEY (plan_id) REFERENCES training_plans(id)
                )
                """
            )
            print("  [attendance_checkin_batch_plans] 已建立")
        else:
            print("  [attendance_checkin_batch_plans] 已存在（跳過）")

        if not _table_exists(cursor, "attendance_checkin_events"):
            cursor.execute(
                """
                CREATE TABLE attendance_checkin_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    emp_id TEXT NOT NULL,
                    plan_id INTEGER NOT NULL,
                    event_time DATETIME,
                    event_type TEXT NOT NULL,
                    batch_id TEXT,
                    source TEXT NOT NULL,
                    result TEXT NOT NULL,
                    ip_address TEXT,
                    FOREIGN KEY (emp_id) REFERENCES users(emp_id),
                    FOREIGN KEY (plan_id) REFERENCES training_plans(id),
                    FOREIGN KEY (batch_id) REFERENCES attendance_checkin_batches(id)
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS ix_attendance_checkin_events_plan_emp "
                "ON attendance_checkin_events(plan_id, emp_id)"
            )
            print("  [attendance_checkin_events] 已建立")
        else:
            print("  [attendance_checkin_events] 已存在（跳過）")

        conn.commit()
        print("\n[done] 遷移完成。")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
