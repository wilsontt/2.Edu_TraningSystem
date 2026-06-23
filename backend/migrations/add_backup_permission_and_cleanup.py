"""
新增「排程備份」獨立權限代碼（menu:admin:backup），並清除除錯腳本遺留的
TestScriptRoot 功能項（見 backend/debug_api_cors.py，非正式功能，僅供開發除錯）。

執行方式：於 backend 目錄下執行 python migrations/add_backup_permission_and_cleanup.py

備註：CREATE/INSERT 皆為冪等（可重複執行）；執行前請先備份資料庫。
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "education_training.db")


def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. 新增「排程備份」獨立權限代碼（掛在「系統管理」之下）
        cursor.execute("SELECT id FROM system_functions WHERE code = 'menu:admin'")
        admin_row = cursor.fetchone()
        parent_id = admin_row[0] if admin_row else None

        cursor.execute("SELECT 1 FROM system_functions WHERE code = 'menu:admin:backup'")
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO system_functions (name, code, path, parent_id) VALUES (?, ?, ?, ?)",
                ("排程備份", "menu:admin:backup", "/admin/backup", parent_id),
            )
            print("已新增權限代碼 menu:admin:backup（排程備份）")
        else:
            print("menu:admin:backup 已存在，略過")

        # 1b. 將新權限授予所有目前持有「系統管理」(menu:admin) 的角色（延續既有子功能慣例，
        #     例如單位管理／權限管理皆同時授予 Admin、系統管理角色；否則前端選單會因
        #     user.functions 不含此代碼而被過濾掉，即使後端 check_permission 對這些角色名稱有 bypass）
        cursor.execute("SELECT id FROM system_functions WHERE code = 'menu:admin:backup'")
        backup_func_id = cursor.fetchone()[0]
        cursor.execute(
            "SELECT DISTINCT rf.role_id FROM role_functions rf "
            "JOIN system_functions sf ON sf.id = rf.function_id WHERE sf.code = 'menu:admin'"
        )
        admin_role_ids = [row[0] for row in cursor.fetchall()]
        for role_id in admin_role_ids:
            cursor.execute(
                "SELECT 1 FROM role_functions WHERE role_id = ? AND function_id = ?",
                (role_id, backup_func_id),
            )
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO role_functions (role_id, function_id) VALUES (?, ?)",
                    (role_id, backup_func_id),
                )
                print(f"已授予角色 id={role_id} 權限 menu:admin:backup")

        # 2. 清除 TestScriptRoot 除錯遺留項（先清角色關聯，再刪功能本身）
        cursor.execute("SELECT id FROM system_functions WHERE code = 'test:script:root'")
        test_row = cursor.fetchone()
        if test_row:
            test_func_id = test_row[0]
            cursor.execute("DELETE FROM role_functions WHERE function_id = ?", (test_func_id,))
            cursor.execute("DELETE FROM system_functions WHERE id = ?", (test_func_id,))
            print(f"已移除除錯遺留功能 TestScriptRoot（id={test_func_id}）")
        else:
            print("TestScriptRoot 不存在，略過")

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
