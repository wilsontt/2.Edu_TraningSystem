import sqlite3
import os

# Correct path relative to backend/ (where we run the script)
db_path = '../data/education_training.db'

def run_migration():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    print(f"Migrating database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Add passing_score to training_plans
        cursor.execute("PRAGMA table_info(training_plans)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'passing_score' not in columns:
            print("Adding 'passing_score' column to training_plans...")
            cursor.execute("ALTER TABLE training_plans ADD COLUMN passing_score INTEGER DEFAULT 60")
        else:
            print("'passing_score' column already exists.")

        # 2. Create plan_target_departments table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='plan_target_departments'")
        if not cursor.fetchone():
            print("Creating 'plan_target_departments' table...")
            cursor.execute("""
                CREATE TABLE plan_target_departments (
                    plan_id INTEGER,
                    dept_id INTEGER,
                    FOREIGN KEY(plan_id) REFERENCES training_plans(id),
                    FOREIGN KEY(dept_id) REFERENCES departments(id)
                )
            """)
        else:
            print("'plan_target_departments' table already exists.")
            
        conn.commit()
        print("Migration completed successfully.")
        
    except Exception as e:
        print(f"Error migrating: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
