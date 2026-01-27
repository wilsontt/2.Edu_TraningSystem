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
        # 1. Create plan_target_users table
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='plan_target_users'")
        if not cursor.fetchone():
            print("Creating 'plan_target_users' table...")
            cursor.execute("""
                CREATE TABLE plan_target_users (
                    plan_id INTEGER,
                    emp_id TEXT,
                    FOREIGN KEY(plan_id) REFERENCES training_plans(id),
                    FOREIGN KEY(emp_id) REFERENCES users(emp_id),
                    PRIMARY KEY (plan_id, emp_id)
                )
            """)
        else:
            print("'plan_target_users' table already exists.")

        # 2. Add is_archived column to training_plans
        cursor.execute("PRAGMA table_info(training_plans)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'is_archived' not in columns:
            print("Adding 'is_archived' column to training_plans...")
            cursor.execute("ALTER TABLE training_plans ADD COLUMN is_archived INTEGER DEFAULT 0")
            # Update existing records to set is_archived = 0 (False)
            cursor.execute("UPDATE training_plans SET is_archived = 0 WHERE is_archived IS NULL")
        else:
            print("'is_archived' column already exists.")
            
        conn.commit()
        print("Migration completed successfully.")
        
    except Exception as e:
        print(f"Error migrating: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_migration()
