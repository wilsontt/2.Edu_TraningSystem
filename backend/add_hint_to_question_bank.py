import sqlite3
import os

# 資料庫路徑（從 backend/ 目錄執行）
db_path = '../data/education_training.db'

def run_migration():
    """添加 hint 欄位到 question_bank 表"""
    # 嘗試多個路徑
    possible_paths = [
        db_path,
        'data/education_training.db',
        os.path.join(os.path.dirname(__file__), '..', 'data', 'education_training.db')
    ]
    
    actual_path = None
    for path in possible_paths:
        abs_path = os.path.abspath(path)
        if os.path.exists(abs_path):
            actual_path = abs_path
            break
    
    if not actual_path:
        print(f"錯誤：找不到資料庫檔案。嘗試過的路徑：")
        for path in possible_paths:
            print(f"  - {os.path.abspath(path)}")
        return False

    print(f"正在遷移資料庫: {actual_path}")
    conn = sqlite3.connect(actual_path)
    cursor = conn.cursor()
    
    try:
        # 檢查 question_bank 表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='question_bank'")
        if not cursor.fetchone():
            print("錯誤：question_bank 表不存在。")
            conn.close()
            return False
        
        # 檢查 hint 欄位是否存在
        cursor.execute("PRAGMA table_info(question_bank)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'hint' not in columns:
            print("正在添加 'hint' 欄位到 question_bank 表...")
            cursor.execute("ALTER TABLE question_bank ADD COLUMN hint TEXT")
            conn.commit()
            print("成功添加 'hint' 欄位。")
        else:
            print("'hint' 欄位已存在。")
            
        conn.close()
        print("遷移完成。")
        return True
        
    except Exception as e:
        print(f"遷移時發生錯誤: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        conn.close()
        return False

if __name__ == "__main__":
    success = run_migration()
    exit(0 if success else 1)
