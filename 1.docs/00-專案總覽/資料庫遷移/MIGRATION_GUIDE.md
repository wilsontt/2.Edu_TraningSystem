# 資料庫遷移指南

## 問題修復步驟

### 1. 安裝缺失的套件

後端錯誤是因為缺少 `qrcode` 套件。根據您的環境，使用以下方式安裝：

#### 如果您使用 uv（推薦）

```bash
cd backend
uv pip install "qrcode[pil]"
# 或
uv pip install -r requirements.txt
```

#### 如果您使用傳統的 virtualenv

```bash
cd backend
# 啟動虛擬環境
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate  # Windows

# 安裝套件
pip install "qrcode[pil]"
# 或
pip install -r requirements.txt
```

#### 如果您使用 Python venv

```bash
cd backend
.venv/bin/python3 -m pip install "qrcode[pil]"
```

**注意**：`requirements.txt` 已經包含 `qrcode[pil]`，如果環境正確設定，執行 `pip install -r requirements.txt` 即可。

### 2. 執行資料庫遷移

#### 方法一：使用遷移腳本（推薦）

```bash
cd backend
.venv/bin/python3 migrate_qrcode_and_attendance.py
```

此腳本會自動：
- 檢查並新增 `training_plans.expected_attendance` 欄位
- 建立 `attendance_records` 表（報到記錄）
- 建立 `login_tokens` 表（登入 QRcode token）
- 建立必要的索引

#### 方法二：使用 SQLAlchemy 自動建立表

如果資料庫是全新的，可以直接使用 `init_db.py`：

```bash
cd backend
.venv/bin/python3 -m app.init_db
```

**注意**：`init_db.py` 會根據 `models.py` 自動建立所有表，包括新新增的表。但如果資料庫已存在且包含資料，建議使用方法一的遷移腳本。

#### 方法三：手動執行 SQL（進階）

如果需要手動執行 SQL，可以連接資料庫後執行以下 SQL：

```sql
-- 1. 新增應到人數欄位
ALTER TABLE training_plans ADD COLUMN expected_attendance INTEGER;

-- 2. 建立報到記錄表
CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id TEXT NOT NULL,
    plan_id INTEGER NOT NULL,
    checkin_time DATETIME NOT NULL,
    ip_address TEXT,
    FOREIGN KEY(emp_id) REFERENCES users(emp_id),
    FOREIGN KEY(plan_id) REFERENCES training_plans(id),
    UNIQUE(emp_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_id ON attendance_records(emp_id);
CREATE INDEX IF NOT EXISTS idx_attendance_plan_id ON attendance_records(plan_id);

-- 3. 建立登入 Token 表
CREATE TABLE IF NOT EXISTS login_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    is_used BOOLEAN DEFAULT 0,
    FOREIGN KEY(created_by) REFERENCES users(emp_id)
);

CREATE INDEX IF NOT EXISTS idx_login_token_token ON login_tokens(token);
CREATE INDEX IF NOT EXISTS idx_login_token_created_by ON login_tokens(created_by);
```

### 3. 驗證遷移結果

執行遷移後，可以檢查資料庫結構：

```bash
cd backend
.venv/bin/python3 -c "
import sqlite3
conn = sqlite3.connect('../data/education_training.db')
cursor = conn.cursor()

# 檢查表是否存在
tables = ['attendance_records', 'login_tokens']
for table in tables:
    cursor.execute(f\"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'\")
    if cursor.fetchone():
        print(f'✓ {table} 表存在')
    else:
        print(f'✗ {table} 表不存在')

# 檢查欄位
cursor.execute('PRAGMA table_info(training_plans)')
columns = [info[1] for info in cursor.fetchall()]
if 'expected_attendance' in columns:
    print('✓ training_plans.expected_attendance 欄位存在')
else:
    print('✗ training_plans.expected_attendance 欄位不存在')

conn.close()
"
```

### 4. 重啟後端服務

遷移完成後，重啟後端服務：

```bash
cd backend
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 遷移腳本說明

`migrate_qrcode_and_attendance.py` 腳本特點：
- ✅ 安全：會檢查表/欄位是否已存在，避免重複建立
- ✅ 冪等性：可以安全地多次執行
- ✅ 錯誤處理：包含完整的錯誤處理和回滾機制
- ✅ 詳細日誌：顯示每個步驟的執行結果

## AD 整合：break-glass 帳號遷移（`add_ad_auth_user_fields.py`）

**適用**：棕地專案「AD 整合 — 系統管理者登入」Wave W1 之後。

### 執行步驟

```bash
# 1. 備份（必做）
cp data/education_training.db data/education_training.db.bak.$(date +%Y%m%d)

# 2. 設定 break-glass 初始密碼（僅注入用，勿提交版控）
export INITIAL_ADMIN_PASSWORD='符合政策的初始密碼'

# 3. 必須使用 backend 虛擬環境 Python
cd backend
.venv/bin/python3 migrations/add_ad_auth_user_fields.py
```

成功輸出須包含：`[users] admin.password_hash 已設定（INITIAL_ADMIN_PASSWORD）`。

### 驗證

```bash
sqlite3 data/education_training.db \
  "SELECT password_hash IS NOT NULL FROM users WHERE emp_id='admin';"
# 預期回傳 1
```

重啟後端後以 `POST /api/auth/login/local` 測試（路徑 B break-glass）。

### break-glass 登入 403「帳號未設定密碼」

| 原因 | 處理 |
|------|------|
| 用**系統** `python3` 跑遷移，venv 內 `bcrypt` 未載入 | 改為 `backend/.venv/bin/python3 migrations/add_ad_auth_user_fields.py` |
| 未設定 `INITIAL_ADMIN_PASSWORD` | 匯出環境變數後重跑遷移 |
| 遷移只 warning、腳本仍 exit 0 | 確認 `password_hash` 非 NULL；必要時更新遷移腳本後重跑 |
| `passlib` + `bcrypt 5.x` 驗證失敗 | break-glass 須用 `auth_utils.hash_password` / `verify_password`（`bcrypt` 直接），見 Cloud Code 提示詞 §10 |

詳細案例與 curl 範例：`1.docs/02-棕地專案/交付實作文件/20260625_AD整合_系統管理者登入-CloudCode提示詞.md` §10。

---

## 常見問題

### Q: 執行遷移時出現 "no such file or directory: .venv/bin/pip"
A: 請確認您的虛擬環境路徑。可以使用 `which python3` 來確認 Python 路徑，然後使用對應的 pip。

### Q: 遷移後資料會遺失嗎？
A: 不會。此遷移只會新增表和欄位，不會刪除現有資料。

### Q: 如果遷移失敗怎麼辦？
A: 遷移腳本包含回滾機制。如果失敗，不會影響現有資料。檢查錯誤訊息後，修正問題再重新執行即可。

### Q: 可以回滾遷移嗎？
A: 如果還沒有重要資料，可以：
1. 刪除資料庫檔案重新初始化
2. 或手動執行 DROP TABLE 和 ALTER TABLE 來移除變更

## 下一步

遷移完成後，您可以：
1. 測試 QRcode 登入功能（需要 Admin 權限）
2. 測試報到功能（在考試中心）
3. 測試報到統計功能（在訓練計畫管理中）
