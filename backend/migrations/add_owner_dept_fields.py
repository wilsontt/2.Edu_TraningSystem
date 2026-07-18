"""
W2 遷移：歷史題庫／教材套組新增「開課單位（owner）」欄位。

執行：
  cd <專案根目錄>
  python backend/migrations/add_owner_dept_fields.py

冪等：可連續執行 2 次，第 2 次不報錯也不重複修改。
dept_id 一律 nullable、預設 NULL；NULL 代表不受 owner 限制（既有資料無需回填）。
"""
import os
import sqlite3

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")


def _existing_columns(cursor: sqlite3.Cursor, table: str) -> set:
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def run_migration() -> None:
    if not os.path.exists(db_path):
        print(f"[skip] Database not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        for table in ("question_bank", "teaching_material_sets"):
            cols = _existing_columns(cursor, table)
            if "dept_id" not in cols:
                cursor.execute(
                    f"ALTER TABLE {table} ADD COLUMN dept_id INTEGER REFERENCES departments(id)"
                )
                print(f"  [{table}] 新增欄位：dept_id")
            else:
                print(f"  [{table}] 欄位已存在（跳過）：dept_id")

        conn.commit()
        print("\n[done] 遷移完成。")

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
