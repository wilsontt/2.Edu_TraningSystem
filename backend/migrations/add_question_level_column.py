"""
為 questions 與 question_bank 表新增 level 欄位（題目難易度 E/M/H）。
執行方式：於 backend 目錄下執行 python migrations/add_question_level_column.py
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "data", "education_training.db")

def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        for table in ("questions", "question_bank"):
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [info[1] for info in cursor.fetchall()]
            if "level" not in columns:
                print(f"Adding 'level' column to {table}...")
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN level VARCHAR(20)")
            else:
                print(f"'{table}' already has 'level' column.")
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
