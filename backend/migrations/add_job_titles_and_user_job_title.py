"""
新增職務表 job_titles、User 欄位 job_title_id，並寫入預設職務。
使用與後端相同的 DB：專案根目錄 data/education_training.db。
執行：於專案根或 backend 目錄下
  python backend/migrations/add_job_titles_and_user_job_title.py
  或 cd backend && python migrations/add_job_titles_and_user_job_title.py
"""
import sqlite3
import os

# 專案根目錄 data/（與 backend/app/database.py 一致）
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")

DEFAULT_JOB_TITLES = [
    "主管",
    "稽核",
    "行政助理",
    "倉儲作業",
    "總稽核",
    "工程師",
]


def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='job_titles'")
        if not cursor.fetchone():
            cursor.execute("""
                CREATE TABLE job_titles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0
                )
            """)
            for i, name in enumerate(DEFAULT_JOB_TITLES):
                cursor.execute("INSERT INTO job_titles (name, sort_order) VALUES (?, ?)", (name, i))
            print("Created table job_titles and seeded default job titles.")
        else:
            print("Table job_titles already exists.")

        cursor.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in cursor.fetchall()]
        if "job_title_id" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN job_title_id INTEGER REFERENCES job_titles(id)")
            print("Added job_title_id to users.")
        else:
            print("users.job_title_id already exists.")
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
