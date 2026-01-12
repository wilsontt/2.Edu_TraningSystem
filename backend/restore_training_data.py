#!/usr/bin/env python3
# restore_training_data.py
import sqlite3
from pathlib import Path

script_dir = Path(__file__).parent.resolve()
db_path = script_dir.parent / 'data' / 'education_training.db'
backup_path = script_dir.parent / 'data' / 'education_training 2.db'

print("=" * 70)
print("🔄 恢復訓練計劃、題目和題庫資料")
print("=" * 70)

backup_conn = sqlite3.connect(str(backup_path))
current_conn = sqlite3.connect(str(db_path))

backup_cursor = backup_conn.cursor()
current_cursor = current_conn.cursor()

# 檢查備份中的資料
print("\n📊 備份資料庫中的資料：")
for table in ['training_plans', 'questions', 'question_bank']:
    try:
        backup_cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = backup_cursor.fetchone()[0]
        print(f"  {table}: {count} 筆")
    except:
        print(f"  {table}: 表不存在或錯誤")

# 檢查表結構
print("\n🔍 檢查 training_plans 表結構差異：")
backup_cursor.execute("PRAGMA table_info(training_plans)")
backup_columns = {col[1]: col[2] for col in backup_cursor.fetchall()}

current_cursor.execute("PRAGMA table_info(training_plans)")
current_columns = {col[1]: col[2] for col in current_cursor.fetchall()}

print(f"  備份表欄位: {list(backup_columns.keys())}")
print(f"  當前表欄位: {list(current_columns.keys())}")

# 找出共同的欄位
common_columns = [col for col in backup_columns.keys() if col in current_columns.keys()]
print(f"  共同欄位: {common_columns}")

# 恢復 training_plans
print("\n📦 恢復 training_plans...")
try:
    backup_cursor.execute("SELECT * FROM training_plans")
    rows = backup_cursor.fetchall()
    
    # 獲取欄位名稱
    backup_cursor.execute("PRAGMA table_info(training_plans)")
    backup_cols = [col[1] for col in backup_cursor.fetchall()]
    
    current_cursor.execute("PRAGMA table_info(training_plans)")
    current_cols = [col[1] for col in current_cursor.fetchall()]
    
    # 只使用共同的欄位
    common_cols = [col for col in backup_cols if col in current_cols]
    
    restored = 0
    for row in rows:
        # 建立欄位到值的映射
        row_dict = dict(zip(backup_cols, row))
        
        # 只取共同欄位的值
        values = [row_dict.get(col) for col in common_cols]
        placeholders = ','.join(['?' for _ in common_cols])
        cols_str = ','.join(common_cols)
        
        try:
            current_cursor.execute(
                f"INSERT OR IGNORE INTO training_plans ({cols_str}) VALUES ({placeholders})",
                values
            )
            if current_cursor.rowcount > 0:
                restored += 1
        except Exception as e:
            print(f"  錯誤插入資料: {e}")
            continue
    
    print(f"  ✅ 成功恢復 {restored} 筆 training_plans")
except Exception as e:
    print(f"  ❌ 錯誤: {e}")

# 恢復 questions
print("\n📦 恢復 questions...")
try:
    backup_cursor.execute("SELECT COUNT(*) FROM questions")
    backup_count = backup_cursor.fetchone()[0]
    
    backup_cursor.execute("SELECT * FROM questions")
    rows = backup_cursor.fetchall()
    
    backup_cursor.execute("PRAGMA table_info(questions)")
    backup_cols = [col[1] for col in backup_cursor.fetchall()]
    
    restored = 0
    for row in rows:
        try:
            placeholders = ','.join(['?' for _ in backup_cols])
            cols_str = ','.join(backup_cols)
            current_cursor.execute(
                f"INSERT OR IGNORE INTO questions ({cols_str}) VALUES ({placeholders})",
                row
            )
            if current_cursor.rowcount > 0:
                restored += 1
        except Exception as e:
            continue
    
    print(f"  ✅ 成功恢復 {restored}/{backup_count} 筆 questions")
except Exception as e:
    print(f"  ❌ 錯誤: {e}")

# 恢復 question_bank
print("\n📦 恢復 question_bank...")
try:
    backup_cursor.execute("SELECT COUNT(*) FROM question_bank")
    backup_count = backup_cursor.fetchone()[0]
    
    backup_cursor.execute("SELECT * FROM question_bank")
    rows = backup_cursor.fetchall()
    
    backup_cursor.execute("PRAGMA table_info(question_bank)")
    backup_cols = [col[1] for col in backup_cursor.fetchall()]
    
    restored = 0
    for row in rows:
        try:
            placeholders = ','.join(['?' for _ in backup_cols])
            cols_str = ','.join(backup_cols)
            current_cursor.execute(
                f"INSERT OR IGNORE INTO question_bank ({cols_str}) VALUES ({placeholders})",
                row
            )
            if current_cursor.rowcount > 0:
                restored += 1
        except Exception as e:
            continue
    
    print(f"  ✅ 成功恢復 {restored}/{backup_count} 筆 question_bank")
except Exception as e:
    print(f"  ❌ 錯誤: {e}")

current_conn.commit()

# 驗證結果
print("\n📊 恢復後統計：")
for table in ['training_plans', 'questions', 'question_bank']:
    try:
        current_cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = current_cursor.fetchone()[0]
        print(f"  {table}: {count} 筆")
    except:
        print(f"  {table}: 錯誤")

backup_conn.close()
current_conn.close()