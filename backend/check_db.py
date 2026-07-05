
import sqlite3
import os

db_path = "sql_app.db"
if not os.path.exists(db_path):
    print(f"Database {db_path} not found!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check tables
cursor.execute("SELECT name FROM sqlite_master WHERE type=\"table\"")
tables = cursor.fetchall()
print("Tables:", [t[0] for t in tables])

# Check columns in training_plans
try:
    cursor.execute("PRAGMA table_info(training_plans)")
    columns = [row[1] for row in cursor.fetchall()]
    print("Columns in training_plans:", columns)
    
    if "end_date" not in columns:
        print("Adding end_date column...")
        cursor.execute("ALTER TABLE training_plans ADD COLUMN end_date DATE")
        conn.commit()
        print("Column added successfully.")
    else:
        print("Column end_date already exists.")

except Exception as e:
    print(f"Error: {e}")

conn.close()

