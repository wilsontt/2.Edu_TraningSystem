
import sqlite3
try:
    conn = sqlite3.connect("sql_app.db")
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE training_plans ADD COLUMN end_date DATE")
    conn.commit()
    print("Column added")
except Exception as e:
    print(e)
finally:
    conn.close()

