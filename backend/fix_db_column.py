
import sqlite3
import os

# Define path
db_path = "/Users/wilson/Documents/5. Projects/3. 企業入口網站/2.教育訓練教材及線上考卷/data/education_training.db"

if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
    # Try alternative
    db_path = "data/education_training.db"
    
if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path} either.")
    exit(1)

print(f"Opening database: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("PRAGMA table_info(training_plans)")
    columns = [info[1] for info in cursor.fetchall()]
    
    if "end_date" in columns:
        print("Column 'end_date' already exists.")
    else:
        print("Adding 'end_date' column...")
        cursor.execute("ALTER TABLE training_plans ADD COLUMN end_date DATE")
        conn.commit()
        print("Column added successfully.")
        
    conn.close()
except Exception as e:
    print(f"An error occurred: {e}")
