"""
新增未報到原因表 attendance_absence_reasons。
使用專案根目錄 data/education_training.db。
"""
import sqlite3
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")

def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_absence_reasons'")
        if not cursor.fetchone():
            cursor.execute("""
                CREATE TABLE attendance_absence_reasons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    plan_id INTEGER NOT NULL REFERENCES training_plans(id),
                    emp_id TEXT NOT NULL REFERENCES users(emp_id),
                    reason_code TEXT NOT NULL,
                    reason_text TEXT,
                    recorded_by TEXT NOT NULL REFERENCES users(emp_id),
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(plan_id, emp_id)
                )
            """)
            print("Created table attendance_absence_reasons.")
        else:
            print("Table attendance_absence_reasons already exists.")
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
