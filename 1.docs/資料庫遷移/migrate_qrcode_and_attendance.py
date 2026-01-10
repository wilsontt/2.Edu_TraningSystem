"""
資料庫遷移腳本：新增 QRcode 登入與報到功能相關的表和欄位
執行方式：python migrate_qrcode_and_attendance.py
"""
import sqlite3
import os
from datetime import datetime

# 資料庫路徑（相對於 backend/ 目錄）
db_path = '../data/education_training.db'

def check_column_exists(cursor, table_name, column_name):
    """檢查欄位是否存在"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [info[1] for info in cursor.fetchall()]
    return column_name in columns

def check_table_exists(cursor, table_name):
    """檢查表是否存在"""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone() is not None

def run_migration():
    if not os.path.exists(db_path):
        print(f"資料庫 {db_path} 不存在，將在執行 init_db 時自動建立")
        print("請先執行 python -m app.init_db 來初始化資料庫")
        return

    print(f"開始遷移資料庫: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. 新增 TrainingPlan.expected_attendance 欄位
        if not check_column_exists(cursor, 'training_plans', 'expected_attendance'):
            print("新增 'expected_attendance' 欄位到 training_plans 表...")
            cursor.execute("ALTER TABLE training_plans ADD COLUMN expected_attendance INTEGER")
            print("✓ expected_attendance 欄位已新增")
        else:
            print("✓ expected_attendance 欄位已存在")

        # 2. 建立 attendance_records 表
        if not check_table_exists(cursor, 'attendance_records'):
            print("建立 'attendance_records' 表...")
            cursor.execute("""
                CREATE TABLE attendance_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    emp_id TEXT NOT NULL,
                    plan_id INTEGER NOT NULL,
                    checkin_time DATETIME NOT NULL,
                    ip_address TEXT,
                    FOREIGN KEY(emp_id) REFERENCES users(emp_id),
                    FOREIGN KEY(plan_id) REFERENCES training_plans(id),
                    UNIQUE(emp_id, plan_id)
                )
            """)
            # 建立索引以提升查詢效能
            cursor.execute("CREATE INDEX idx_attendance_emp_id ON attendance_records(emp_id)")
            cursor.execute("CREATE INDEX idx_attendance_plan_id ON attendance_records(plan_id)")
            print("✓ attendance_records 表已建立")
        else:
            print("✓ attendance_records 表已存在")

        # 3. 建立 login_tokens 表
        if not check_table_exists(cursor, 'login_tokens'):
            print("建立 'login_tokens' 表...")
            cursor.execute("""
                CREATE TABLE login_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token TEXT UNIQUE NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at DATETIME NOT NULL,
                    expires_at DATETIME NOT NULL,
                    used_at DATETIME,
                    is_used BOOLEAN DEFAULT 0,
                    FOREIGN KEY(created_by) REFERENCES users(emp_id)
                )
            """)
            # 建立索引
            cursor.execute("CREATE INDEX idx_login_token_token ON login_tokens(token)")
            cursor.execute("CREATE INDEX idx_login_token_created_by ON login_tokens(created_by)")
            print("✓ login_tokens 表已建立")
        else:
            print("✓ login_tokens 表已存在")

        conn.commit()
        print("\n✅ 資料庫遷移完成！")
        
    except Exception as e:
        print(f"\n❌ 遷移過程中發生錯誤: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
