"""
新增系統功能「報到總覽」至 system_functions（若尚不存在）。
使用專案根目錄 data/education_training.db。
"""
import sqlite3
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")

CODE = "menu:attendance-overview"
NAME = "報到總覽"
PATH = "/attendance-overview"


def run():
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM system_functions WHERE code = ?", (CODE,))
        if cursor.fetchone():
            print("報到總覽 功能已存在")
        else:
            cursor.execute(
                "INSERT INTO system_functions (name, code, path, parent_id) VALUES (?, ?, ?, NULL)",
                (NAME, CODE, PATH),
            )
            print("已新增系統功能：報到總覽 (menu:attendance-overview)")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    run()
