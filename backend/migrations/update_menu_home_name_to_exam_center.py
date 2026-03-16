"""
將 system_functions 中 code = menu:home 的名稱改為「考試中心」。
使用專案根目錄 data/education_training.db。
"""
import sqlite3
import os

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")


def run():
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE system_functions SET name = ? WHERE code = ?", ("考試中心", "menu:home"))
        if cursor.rowcount:
            print("已將 menu:home 名稱更新為「考試中心」")
        else:
            print("未找到 code = menu:home 的記錄，或名稱已是考試中心")
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    run()
