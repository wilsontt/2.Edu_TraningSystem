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
# 本機開發測試- 資料庫移轉
cd backend
.venv/bin/python3 migrate_qrcode_and_attendance.py
```

此腳本會自動：
- 檢查並新增 `training_plans.expected_attendance` 欄位
- 建立 `attendance_records` 表（報到記錄）
- 建立 `login_tokens` 表（登入 QRcode token）
- 建立必要的索引


#### ds1 Docker：在容器內執行遷移

> 主機 `backend/` **沒有** `.venv`；須用 `docker compose exec training-backend`。

```bash
cd /opt/apps/enterprise-portal/deploy

# 備份
cp -a "${DATA_ROOT:-/opt/apps/enterprise-portal/data}/training/education_training.db" \
      "${DATA_ROOT:-/opt/apps/enterprise-portal/data}/training/education_training.db.bak.$(date +%Y%m%d_%H%M%S)"

# AD 整合遷移（break-glass 緊急登入）
export INITIAL_ADMIN_PASSWORD='你的初始管理員密碼'
docker compose exec \
  -e INITIAL_ADMIN_PASSWORD \
  training-backend \
  python migrations/add_ad_auth_user_fields.py
```

成功應看到：`[users] admin.password_hash 已設定（INITIAL_ADMIN_PASSWORD）`

其他遷移（依版本需求擇一或依序執行，皆可重複跑）：

```bash
docker compose exec training-backend python migrations/add_job_titles_and_user_job_title.py
docker compose exec training-backend python migrations/add_training_plan_enhancements.py
docker compose exec training-backend python migrations/add_attendance_absence_reasons.py
docker compose exec training-backend python migrations/add_material_file_formats.py
docker compose exec training-backend python migrations/add_exam_retake_authorization.py
docker compose exec training-backend python migrations/add_retake_auth_consumed_history_id.py
docker compose exec training-backend python migrations/backfill_attendance_from_exam.py
```

> **常見誤用（Docker 主機）**：在 `backend/` 執行 `.venv/bin/python3 migrations/...` 會報 `No such file or directory`；在 `backend/` 執行 `uv venv` 會報 `Command 'uv' not found`。**正式環境不建 venv、不裝 uv**；一律從 `deploy/` 目錄用 `docker compose exec training-backend python migrations/...`。備份路徑為 `${DATA_ROOT}/training/education_training.db`，**不是** `backend/data/`。

#### SMTP 密碼密件化（2026-07-04）

`SMTP_PASSWORD` 建議改為 Fernet 密文（`enc:` 前綴），執行期以 `CREDENTIAL_SECRET`（或既有 `BACKUP_CREDENTIAL_SECRET`）解密。明文仍可運作但啟動會警告。

**本機開發**（`backend/.env`）：

```bash
cd backend

# 1. 若尚無金鑰，產生並寫入 .env（擇一即可）
# CREDENTIAL_SECRET=...   # 建議新部署使用此名稱
# 或沿用既有 BACKUP_CREDENTIAL_SECRET=...

# 產生金鑰：
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. 加密 SMTP 密碼（輸出整行貼到 SMTP_PASSWORD=）
# Windows:
.\.venv\Scripts\python.exe scripts/encrypt_env_secret.py "你的SMTP明文密碼"
# Linux/macOS:
# .venv/bin/python3 scripts/encrypt_env_secret.py "你的SMTP明文密碼"

# 3. 編輯 backend/.env
# SMTP_PASSWORD=enc:gAAAAA...

# 4. 完整重啟後端
```

**ds1 Docker**（`deploy/.env`；映像**不含** `backend/.env`）：

```bash
cd /opt/apps/enterprise-portal/deploy

# 1. 產生金鑰
docker compose exec training-backend python -c \
  "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. 寫入 deploy/.env（變數名必須是 TRAINING_CREDENTIAL_SECRET，不是 backend/.env 的 BACKUP_CREDENTIAL_SECRET）
# TRAINING_CREDENTIAL_SECRET=<上一步輸出>

# 3. 重建容器讓金鑰進入 training-backend
docker compose up -d --force-recreate training-backend

# 4. 加密 SMTP 密碼（輸出貼到 TRAINING_SMTP_PASSWORD=）
docker compose exec training-backend python scripts/encrypt_env_secret.py "你的SMTP明文密碼"

# 5. 編輯 deploy/.env
# TRAINING_SMTP_PASSWORD=enc:gAAAAA...

# 6. 再次 force-recreate
docker compose up -d --force-recreate training-backend
```

若步驟 3 尚未完成、需先產生密文，可一次性注入金鑰：

```bash
docker compose exec \
  -e CREDENTIAL_SECRET='你的Fernet金鑰' \
  training-backend python scripts/encrypt_env_secret.py "你的SMTP明文密碼"
```

驗證：啟動後不應再出現「SMTP_PASSWORD 仍為明文」警告；Email OTP 寄信正常。

> 更換 `CREDENTIAL_SECRET` 後須重新執行加密腳本，舊密文無法用新金鑰解密。

#### 教材允許格式主檔（2026-07-04）

新增 `material_file_formats` 表，並冪等植入預設副檔名（含 `mp4`／`webm`）與教材類型「影音教材」。  
對應 PLAN：[`20260704_教材主檔與允許格式維護_PLAN.md`](../../02-棕地專案/plans/已完成/20260704_教材主檔與允許格式維護_PLAN.md)。

```bash
# 1. 備份（本機）
# Windows PowerShell 請自行複製 data\education_training.db

# 2. 執行（可重複跑）
cd backend
# Windows:
.\.venv\Scripts\python.exe migrations/add_material_file_formats.py
# Linux/macOS:
# .venv/bin/python3 migrations/add_material_file_formats.py
```

成功應看到：`Migration completed successfully.`

驗證：

```sql
SELECT ext, label, max_file_bytes, is_active FROM material_file_formats ORDER BY sort_order;
SELECT name, slug FROM material_types WHERE slug = '影音教材';
```

ds1 Docker：

```bash
cp -a "${DATA_ROOT}/training/education_training.db" "${DATA_ROOT}/training/education_training.db.bak.$(date +%Y%m%d_%H%M%S)"
docker compose exec training-backend python migrations/add_material_file_formats.py
```

#### 報到紀錄歷史補齊（2026-07-03）

報到功能（T10）上線前已交卷、卻無 `attendance_records` 的舊資料，須以**第一次考試時間**補登報到列。  
**部署含「開考強制報到檢查」的後端前，必須先執行本腳本**（否則舊考生會被視為未報到）。

```bash
# 1. 備份（本機）
cp data/education_training.db data/education_training.db.bak-$(date +%Y%m%d)

# 2. 執行（可重複跑，已有報到列者 skip）
cd backend
.venv/bin/python3 migrations/backfill_attendance_from_exam.py
```

`checkin_time` 取值順序：`MIN(exam_history.submit_time)` → `exam_records.start_time` → `exam_records.submit_time`。

驗證（缺口數應為 0）：

```sql
SELECT COUNT(*) FROM exam_records er
LEFT JOIN attendance_records ar ON ar.emp_id = er.emp_id AND ar.plan_id = er.plan_id
WHERE er.submit_time IS NOT NULL AND ar.id IS NULL;
```

ds1 Docker：

```bash
cp -a "${DATA_ROOT}/training/education_training.db" "${DATA_ROOT}/training/education_training.db.bak.$(date +%Y%m%d_%H%M%S)"
docker compose exec training-backend python migrations/backfill_attendance_from_exam.py
```

##### 症狀：成績詳情顯示已考過，點「開始考試」仍跳出「尚未完成報到」

| 項目 | 說明 |
|------|------|
| **現象** | 成績中心有交卷紀錄（含多次挑戰），考試中心點「開始考試」卻要求報到 |
| **根因** | `exam_records`（考試）與 `attendance_records`（報到）為**不同資料表**；有考試紀錄不代表有報到紀錄。常見於強制報到檢查上線前的舊資料，或正式環境未執行本 backfill |
| **個人立即解法** | 點彈窗「立即報到」；同一訓練計畫報到過後重考不會再問 |
| **維運批次解法** | 執行本節 `backfill_attendance_from_exam.py`（見上方 ds1 Docker 指令） |

#### 已通過授權重考（2026-07-08）

新增 `exam_retake_authorizations` 表、`exam_records.retake_authorized` 欄位、`btn:exam:authorize-retake` 功能碼。  
對應 PLAN：[`20260709_已通過授權重考與考試中心及格分修正及Modal雙欄_PLAN.md`](../../02-棕地專案/plans/已完成/20260709_已通過授權重考與考試中心及格分修正及Modal雙欄_PLAN.md)。

**本機開發**：

```bash
# 1. 備份
cp data/education_training.db data/education_training.db.bak-$(date +%Y%m%d)

# 2. 執行（可重複跑）
cd backend
.venv/bin/python3 migrations/add_exam_retake_authorization.py
```

成功應看到：`exam_records.retake_authorized 欄位已新增。`、`Migration 完成。`

**ds1 Docker**：

```bash
cd /opt/apps/enterprise-portal/deploy

cp -a "${DATA_ROOT:-/opt/apps/enterprise-portal/data}/training/education_training.db" \
      "${DATA_ROOT:-/opt/apps/enterprise-portal/data}/training/education_training.db.bak.$(date +%Y%m%d_%H%M%S)"

docker compose exec training-backend python migrations/add_exam_retake_authorization.py
```

若報 `No such file or directory`（腳本不存在），先重建映像：

```bash
docker compose build training-backend
docker compose up -d --force-recreate training-backend
```

##### 症狀：考試中心／成績中心完全空白（任何員工皆無資料）

| 項目 | 說明 |
|------|------|
| **現象** | 登入後考試中心、成績中心無列表；瀏覽器 Network 中 `GET /api/exam/my_exams`、`GET /api/exam/personal/history` 回 **500** |
| **後端日誌** | `sqlite3.OperationalError: no such column: exam_records.retake_authorized` |
| **根因** | 程式已使用 `retake_authorized` 欄位，但資料庫未執行本遷移。`init_db` 只 `create_all`，**不會**對既有表 `ALTER TABLE` |
| **修復** | 執行本節 `add_exam_retake_authorization.py`（見上方本機／Docker 指令） |
| **驗證** | API 由 500 變 200；`PRAGMA table_info(exam_records)` 含 `retake_authorized` |

驗證 SQL：

```sql
PRAGMA table_info(exam_records);  -- 應含 retake_authorized
SELECT name FROM sqlite_master WHERE type='table' AND name='exam_retake_authorizations';
```

#### 授權重考歷程對應（2026-07-10）

新增 `exam_retake_authorizations.consumed_history_id`（FK → `exam_history.id`），交卷消耗授權時綁定第 N＋1 次歷程。  
對應 PLAN：[`20260710_授權重考歷程對應與顯示_PLAN.md`](../../02-棕地專案/plans/已完成/20260710_授權重考歷程對應與顯示_PLAN.md)。

**本機開發**：

```bash
cp data/education_training.db data/education_training.db.bak-$(date +%Y%m%d)
cd backend
.venv/bin/python3 migrations/add_retake_auth_consumed_history_id.py
```

**ds1 Docker**：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose exec training-backend python migrations/add_retake_auth_consumed_history_id.py
```

驗證：

```sql
PRAGMA table_info(exam_retake_authorizations);  -- 應含 consumed_history_id
```

#### 考試中心時間語意（2026-07-10，無 DB 結構變更）

**SSOT**：`exam_records`／`exam_history` 的 `submit_time`、`start_time`，`attendance_records.checkin_time`，`exam_retake_authorizations.authorized_at`／`consumed_at` 等業務時間，後端一律以 **UTC naive** 寫入；前端以 `parseBackendDateTime()`（無時區 ISO 補 `Z`）轉台灣顯示。

**程式**：`exam_center._now_utc_naive()`；`start_exam`／`submit_exam`／報到／授權重考皆使用此 helper。回歸測試：`tests/test_exam_time_semantics.py`。

**既有資料**：2026-07-03～修正日前若以 `_now_taipei_naive()` 寫入的列，DB 內為「台北牆上時間卻無時區標記」，畫面可能仍偏移約 8 小時；修正後**新產生**的紀錄會正確。若需校正歷史列，請另開資料修復（將該時段誤標時間換算為 UTC 後更新），**非**本節 migration 範圍。

#### ds1 Docker：遷移後設定 AD 環境變數（必做，否則「AD 管理」顯示未啟用）

資料庫遷移**只改 DB 結構**；「AD 整合未啟用」代表容器內 `AD_ENABLED=false` 或缺少 `AD_SERVER_URI`／`AD_BASE_DN`／`AD_DOMAIN`（映像不含 `backend/.env`）。

1. 編輯 `deploy/.env`（參考 `deploy/.env.example` 的 `TRAINING_*` 區塊）：

```bash
vi /opt/apps/enterprise-portal/deploy/.env
```

範例（請改為貴司實際 DC／網域；驗收環境參考 `10.9.82.28:389`）：

```env
TRAINING_JWT_SECRET_KEY=<openssl rand -hex 32 產生的值>
TRAINING_AD_ENABLED=true
TRAINING_AD_SERVER_URI=ldap://10.9.82.28:389
TRAINING_AD_USE_SSL=false
TRAINING_AD_BASE_DN=DC=yourco,DC=com
TRAINING_AD_DOMAIN=yourco.com
TRAINING_AD_ADMIN_GROUP=IT Admins
```

2. 確認 `docker-compose.yml` 的 `training-backend.environment` 已映射 `TRAINING_*` → `AD_*`（本 repo `deploy/docker-compose.yml` 已含）。

3. **重建容器**以載入新環境變數（僅 `restart` 不夠，若 compose 未改過須 `up -d --force-recreate`）：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose up -d --force-recreate training-backend
```

4. 驗證容器內設定：

```bash
docker compose exec training-backend python -c \
  "from app.config import get_settings; s=get_settings(); print('ad_enabled=', s.ad_enabled, 'ad_configured=', s.ad_configured)"
# 預期：ad_enabled= True ad_configured= True
```

| 登入分頁 | 所需條件 |
|----------|----------|
| **AD 管理** | `TRAINING_AD_ENABLED=true` + DC／Base DN／Domain 正確 |
| **緊急登入**（break-glass） | 僅需遷移寫入 `admin.password_hash`；**不受** `AD_ENABLED` 影響 |

#### ds1 Docker：設定 NAS（SMB）環境變數（教材上傳必備）

映像不含 `backend/.env`。若前端 NAS 登入顯示 **「NAS 共享尚未設定（需 SMB_SERVER／SMB_SHARE）」**，代表容器未讀到 `TRAINING_SMB_*`。

1. 編輯 `deploy/.env`（完整註解見 `deploy/.env.example`）：

```env
TRAINING_SMB_SERVER=10.9.82.22
TRAINING_SMB_SHARE=CrownWork
TRAINING_SMB_AUTH_DOMAIN=crownvantw
TRAINING_MATERIALS_ROOT=教育訓練教材及考卷/materials
TRAINING_BACKUP_ROOT=教育訓練教材及考卷/backups
TRAINING_EXAM_SMB_USERNAME=<考卷 service 帳號>
TRAINING_EXAM_SMB_PASSWORD=<密碼或 enc:密文>
```

2. 重建容器：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose up -d --force-recreate training-backend
```

3. 驗證：

```bash
docker compose exec training-backend python -c \
  "from app.config import get_settings; s=get_settings(); \
   print('smb_configured=', s.smb_configured, s.smb_server, s.smb_share, s.materials_root)"
```

| NAS 登入錯誤 | 意義 | 處理 |
|--------------|------|------|
| `NAS 共享尚未設定` | `TRAINING_SMB_*` 未注入 | 補 `deploy/.env` 並 recreate |
| `0xc0000234` | AD 帳號鎖定 | 請 IT 解鎖後再試 |
| `無法連線 NAS (IP)：...` | 網路／帳密／ACL／445 | 查 NAS 權限與防火牆 |

> **教材 NAS 權限**：本系統不維護「AD 群組 → NAS」對照；誰能讀寫 `materials/` 由 **NAS ACL** 決定。詳見 [NAS與路徑跨平台慣例.md](../NAS與路徑跨平台慣例.md)。

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

### Q: 正式環境執行遷移時 `.venv/bin/python3: No such file or directory`

A: Docker 主機的 `backend/` **沒有** `.venv`；Python 在 `training-backend` 容器內。請：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose exec training-backend python migrations/<腳本名>.py
```

**勿**在主機 `backend/` 建 `.venv` 或安裝 `uv`（那是本機開發流程）。備份請用 `${DATA_ROOT}/training/education_training.db`。

### Q: 考試中心／成績中心空白，後端報 `no such column: exam_records.retake_authorized`

A: 執行 [`add_exam_retake_authorization.py`](../../../backend/migrations/add_exam_retake_authorization.py)（見上文「已通過授權重考」小節）。本機用 `.venv/bin/python3`；Docker 用 `docker compose exec training-backend python ...`。

### Q: 已考過試，為什麼還要報到？

A: 報到（`attendance_records`）與考試（`exam_records`）分開儲存。舊資料可能只有考試、無報到列。個人可點「立即報到」；維運請執行 `backfill_attendance_from_exam.py` 批次補齊（見上文「報到紀錄歷史補齊」）。

### Q: AD 管理登入顯示「AD 整合未啟用」
A: 資料庫遷移與 AD 設定無關。請在 `deploy/.env` 設定 `TRAINING_AD_ENABLED=true` 及 `TRAINING_AD_SERVER_URI`、`TRAINING_AD_BASE_DN`、`TRAINING_AD_DOMAIN`，並執行 `docker compose up -d --force-recreate training-backend`。若暫時無法啟用 AD，請改用登入頁「**緊急登入**」分頁（break-glass，需先完成 `add_ad_auth_user_fields.py` 遷移）。

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
