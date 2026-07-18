"""
補齊 attendance_records 的 UNIQUE(emp_id, plan_id)。

歷史表可能缺此約束，導致 React Strict Mode／雙請求競態寫入重複報到列。
本腳本：刪除重複列（保留最小 id）→ 建立唯一索引。可重複執行。
"""
import sqlite3
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")

INDEX_NAME = "uq_attendance_emp_plan"


def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_records'"
        )
        if not cursor.fetchone():
            print("Table attendance_records not found; skip.")
            return

        # 1. 刪除重複：同 emp_id+plan_id 只留最小 id
        cursor.execute(
            """
            SELECT emp_id, plan_id, COUNT(*) AS c
            FROM attendance_records
            GROUP BY emp_id, plan_id
            HAVING c > 1
            """
        )
        dup_groups = cursor.fetchall()
        deleted = 0
        for emp_id, plan_id, count in dup_groups:
            cursor.execute(
                """
                DELETE FROM attendance_records
                WHERE emp_id = ? AND plan_id = ?
                  AND id NOT IN (
                    SELECT MIN(id) FROM attendance_records
                    WHERE emp_id = ? AND plan_id = ?
                  )
                """,
                (emp_id, plan_id, emp_id, plan_id),
            )
            removed = cursor.rowcount
            deleted += removed
            print(f"  [DEDUP] emp_id={emp_id} plan_id={plan_id}: kept 1, removed {removed} (was {count})")

        if not dup_groups:
            print("No duplicate attendance rows.")
        else:
            print(f"Dedup done: removed {deleted} row(s).")

        # 2. 建立唯一索引（若不存在）
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
            (INDEX_NAME,),
        )
        if cursor.fetchone():
            print(f"Index {INDEX_NAME} already exists.")
        else:
            cursor.execute(
                f"""
                CREATE UNIQUE INDEX {INDEX_NAME}
                ON attendance_records (emp_id, plan_id)
                """
            )
            print(f"Created unique index {INDEX_NAME}.")

        conn.commit()
        print("Migration 完成。")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
