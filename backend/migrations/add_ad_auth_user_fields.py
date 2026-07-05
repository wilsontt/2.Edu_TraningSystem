"""
W1 遷移：AD 整合所需的 users 欄位與 admin_login_otps 表。

執行：
  cd <專案根目錄>
  python backend/migrations/add_ad_auth_user_fields.py

冪等：可連續執行 2 次，第 2 次不報錯也不重複修改。
環境變數 INITIAL_ADMIN_PASSWORD 若有設定，會同步雜湊並寫入 admin.password_hash。
"""
import os
import sqlite3

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.abspath(os.path.join(_script_dir, "..", ".."))
db_path = os.path.join(_project_root, "data", "education_training.db")


def _existing_columns(cursor: sqlite3.Cursor, table: str) -> set:
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def run_migration() -> None:
    if not os.path.exists(db_path):
        print(f"[skip] Database not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # ----------------------------------------------------------------
        # 1. users 表新增欄位（SQLite 無 ADD COLUMN IF NOT EXISTS，逐欄檢查）
        # ----------------------------------------------------------------
        cols = _existing_columns(cursor, "users")

        new_user_cols = [
            ("auth_source",          "TEXT NOT NULL DEFAULT 'local'"),
            ("ad_username",          "TEXT"),           # UNIQUE 由下方 index 保證
            ("email",                "TEXT"),
            ("email_verified_at",    "DATETIME"),
            ("is_trainee",           "INTEGER NOT NULL DEFAULT 1"),
            ("last_login_at",        "DATETIME"),
            ("password_hash",        "TEXT"),
            ("password_changed_at",  "DATETIME"),
            ("must_change_password", "INTEGER NOT NULL DEFAULT 0"),
            ("failed_login_count",   "INTEGER NOT NULL DEFAULT 0"),
            ("locked_until",         "DATETIME"),
            ("is_protected",         "INTEGER NOT NULL DEFAULT 0"),
        ]

        for col_name, col_def in new_user_cols:
            if col_name not in cols:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
                print(f"  [users] 新增欄位：{col_name}")
            else:
                print(f"  [users] 欄位已存在（跳過）：{col_name}")

        # SQLite 無法直接 ADD COLUMN ... UNIQUE，改用 CREATE UNIQUE INDEX
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ad_username ON users(ad_username)"
        )

        # ----------------------------------------------------------------
        # 2. 建立 admin_login_otps 表（Email OTP 備援）
        # ----------------------------------------------------------------
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admin_login_otps (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                emp_id        TEXT    NOT NULL,
                otp_hash      TEXT    NOT NULL,
                expires_at    DATETIME NOT NULL,
                attempt_count INTEGER  NOT NULL DEFAULT 0,
                created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
                used_at       DATETIME
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_alo_emp_id ON admin_login_otps(emp_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_alo_expires_at ON admin_login_otps(expires_at)"
        )
        print("  [admin_login_otps] 表與索引已確認")

        # ----------------------------------------------------------------
        # 3. 確保「系統管理」角色存在
        # ----------------------------------------------------------------
        cursor.execute(
            "SELECT id FROM roles WHERE name = '系統管理'"
        )
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO roles (name) VALUES ('系統管理')")
            sysadmin_role_id = cursor.lastrowid
            print(f"  [roles] 新增「系統管理」角色 id={sysadmin_role_id}")

            # 給予所有 system_functions 權限
            cursor.execute("SELECT id FROM system_functions")
            func_ids = [r[0] for r in cursor.fetchall()]
            cursor.executemany(
                "INSERT OR IGNORE INTO role_functions (role_id, function_id) VALUES (?, ?)",
                [(sysadmin_role_id, fid) for fid in func_ids],
            )
            print(f"  [role_functions] 授予「系統管理」{len(func_ids)} 項功能")
        else:
            print("  [roles] 「系統管理」角色已存在（跳過）")

        # ----------------------------------------------------------------
        # 4. admin 帳號：設定 is_protected=1、is_trainee=0、auth_source='local'
        #    若環境變數 INITIAL_ADMIN_PASSWORD 已設定，同步寫入 password_hash
        # ----------------------------------------------------------------
        cursor.execute("SELECT emp_id FROM users WHERE emp_id = 'admin'")
        if cursor.fetchone():
            cursor.execute("""
                UPDATE users
                SET is_protected = 1,
                    is_trainee   = 0,
                    auth_source  = 'local'
                WHERE emp_id = 'admin'
            """)
            print("  [users] admin 已更新：is_protected=1, is_trainee=0")

            initial_pw = os.environ.get("INITIAL_ADMIN_PASSWORD", "")
            if initial_pw:
                try:
                    import bcrypt

                    pw_hash = bcrypt.hashpw(
                        initial_pw.encode("utf-8"),
                        bcrypt.gensalt(rounds=12),
                    ).decode("utf-8")
                    cursor.execute(
                        "UPDATE users SET password_hash = ? WHERE emp_id = 'admin'",
                        (pw_hash,),
                    )
                    print("  [users] admin.password_hash 已設定（INITIAL_ADMIN_PASSWORD）")
                except ImportError as exc:
                    raise SystemExit(
                        "bcrypt 未安裝，無法設定 admin 密碼。"
                        "請使用 backend/.venv/bin/python3 執行此遷移腳本。"
                    ) from exc
            else:
                print("  [info] INITIAL_ADMIN_PASSWORD 未設定；admin 暫無 break-glass 密碼")
        else:
            print("  [users] admin 帳號不存在（跳過；請先執行 init_db）")

        conn.commit()
        print("\n[done] 遷移完成。")

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
