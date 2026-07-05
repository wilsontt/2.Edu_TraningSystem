"""
移除已廢止的「功能清單管理」(menu:admin:func) 權限節點。

執行：cd backend && .venv/bin/python3 migrations/remove_menu_admin_func.py
執行前請備份 data/education_training.db；可重複執行（冪等）。
"""
import os
import sqlite3

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")

DEPRECATED_CODE = "menu:admin:func"


def run_migration() -> None:
    if not os.path.exists(db_path):
        print(f"[skip] 資料庫不存在：{db_path}")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT id FROM system_functions WHERE code = ?",
            (DEPRECATED_CODE,),
        )
        row = cursor.fetchone()
        if not row:
            print(f"  [system_functions] {DEPRECATED_CODE} 不存在（略過）")
            conn.commit()
            return

        func_id = row[0]
        cursor.execute(
            "DELETE FROM role_functions WHERE function_id = ?",
            (func_id,),
        )
        deleted_links = cursor.rowcount
        cursor.execute("DELETE FROM system_functions WHERE id = ?", (func_id,))
        print(f"  [system_functions] 已刪除 {DEPRECATED_CODE}（role_functions 移除 {deleted_links} 筆）")
        conn.commit()
        print("[done] 遷移完成。")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
