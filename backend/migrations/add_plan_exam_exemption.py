"""
新增訓練計畫免考三層級關聯表，並為既有計畫 backfill 超管免考角色。

表：
- plan_exam_exempt_roles
- plan_exam_exempt_departments
- plan_exam_exempt_users

執行方式（於 backend 目錄）：
  python migrations/add_plan_exam_exemption.py

冪等：CREATE TABLE IF NOT EXISTS；backfill 以 INSERT OR IGNORE。
執行前請先備份資料庫。
"""
from __future__ import annotations

import os
import sqlite3
from typing import Optional

db_path_default = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "education_training.db"
)

SUPER_ADMIN_ROLE_NAMES = ("Admin", "System Admin", "系統管理", "系統管理者")

CREATE_EXEMPT_ROLES = """
CREATE TABLE IF NOT EXISTS plan_exam_exempt_roles (
    plan_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (plan_id, role_id),
    FOREIGN KEY (plan_id) REFERENCES training_plans(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
)
"""

CREATE_EXEMPT_DEPTS = """
CREATE TABLE IF NOT EXISTS plan_exam_exempt_departments (
    plan_id INTEGER NOT NULL,
    dept_id INTEGER NOT NULL,
    PRIMARY KEY (plan_id, dept_id),
    FOREIGN KEY (plan_id) REFERENCES training_plans(id),
    FOREIGN KEY (dept_id) REFERENCES departments(id)
)
"""

CREATE_EXEMPT_USERS = """
CREATE TABLE IF NOT EXISTS plan_exam_exempt_users (
    plan_id INTEGER NOT NULL,
    emp_id TEXT NOT NULL,
    PRIMARY KEY (plan_id, emp_id),
    FOREIGN KEY (plan_id) REFERENCES training_plans(id),
    FOREIGN KEY (emp_id) REFERENCES users(emp_id)
)
"""


def run_migration(db_path: Optional[str] = None) -> None:
    path = db_path or db_path_default
    if not os.path.exists(path):
        print(f"Database {path} not found.")
        return

    print(f"Migrating database: {path}")
    conn = sqlite3.connect(path)
    cursor = conn.cursor()

    try:
        cursor.execute(CREATE_EXEMPT_ROLES)
        cursor.execute(CREATE_EXEMPT_DEPTS)
        cursor.execute(CREATE_EXEMPT_USERS)

        placeholders = ",".join("?" for _ in SUPER_ADMIN_ROLE_NAMES)
        cursor.execute(
            f"SELECT id FROM roles WHERE name IN ({placeholders})",
            SUPER_ADMIN_ROLE_NAMES,
        )
        super_role_ids = [row[0] for row in cursor.fetchall()]

        cursor.execute("SELECT id FROM training_plans")
        plan_ids = [row[0] for row in cursor.fetchall()]

        inserted = 0
        for plan_id in plan_ids:
            for role_id in super_role_ids:
                cursor.execute(
                    "INSERT OR IGNORE INTO plan_exam_exempt_roles (plan_id, role_id) VALUES (?, ?)",
                    (plan_id, role_id),
                )
                inserted += cursor.rowcount

        conn.commit()
        print(
            f"Migration completed. tables ready; "
            f"backfill super-admin exempt roles rows touched={inserted} "
            f"(plans={len(plan_ids)}, super_roles={len(super_role_ids)})."
        )
    except Exception as e:
        conn.rollback()
        print(f"Error migrating: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
