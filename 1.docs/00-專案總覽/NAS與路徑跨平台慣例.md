# NAS 與路徑跨平台慣例

**文件類型**：作業慣例（長青）  
**建立日期**：2026-07-04  
**最後修訂**：2026-07-06（補 Docker `deploy/.env`／`TRAINING_*`、Fernet、NAS 錯誤對照）  
**適用環境**：Windows／macOS 本機開發、Linux Docker 生產

---

## 1. 目的

確保教材／考卷／備份之 NAS（SMB）路徑與本機檔案路徑寫法，在 **Windows、macOS、Linux Docker** 三端行為一致，避免因斜線、磁碟代號或 cwd 差異導致「NAS 共享尚未設定」或路徑錯置。

## 2. 範圍

| 涵蓋 | 不涵蓋 |
|------|--------|
| `SMB_SERVER`／`SMB_SHARE`／`MATERIALS_ROOT`／`BACKUP_ROOT` | 前端 URL 路由（見 `vite.config.ts`） |
| DB 欄位 `storage_path` | 企業入口其他子系統 |
| `backend/.env` 與 Docker 環境變數注入 | 本機手動掛載 NAS（本系統不依賴 mount） |
| SQLite `data/`、PDF／驗證碼字型候選路徑 | — |

## 3. 權責

| 角色 | 責任 |
|------|------|
| 後端開發 | 業務路徑一律 `/`；本機檔案用 `pathlib`／`os.path`；SMB 經 `storage._unc()` |
| 部署／維運 | 生產以環境變數注入 SMB 設定；不把含密 `.env` 打進映像 |
| 本機開發 | 維護 `backend/.env`（自 `.env.example` 複製），改完後完整重啟後端 |

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| **邏輯相對路徑** | 相對於 SMB 共享（或 `MATERIALS_ROOT`）的路徑，以 `/` 分段，與主機 OS 無關 |
| **UNC** | SMB 協定路徑 `\\server\share\...`，僅由 `storage._unc()` 組出，設定檔不手寫 |
| **本機路徑** | SQLite、暫存檔、系統字型等，使用 `os.path`／`pathlib`，依 OS 解析 |

## 5. 作業內容

### 5.1 路徑分兩類（禁止混用）

| 類型 | 用途 | 寫法 | 是否依 OS 而變 |
|------|------|------|----------------|
| **SMB 邏輯路徑** | 環境變數、`storage_path`、考卷／教材相對路徑 | 只用 `/`；無磁碟代號、無 UNC | 否 |
| **本機檔案路徑** | SQLite `data/`、字型、`tempfile` | `pathlib`／`os.path`，以 `__file__` 推算 | 是（程式處理） |

### 5.2 環境變數正確寫法

```env
SMB_SERVER=10.9.82.22
SMB_SHARE=CrownWork
MATERIALS_ROOT=教育訓練教材及考卷/materials
BACKUP_ROOT=教育訓練教材及考卷/backups
```

程式組出之 UNC（開發者不必手寫）：

`\\10.9.82.22\CrownWork\教育訓練教材及考卷\materials\{year}\{plan}\teaching\...`

### 5.3 禁止寫法

| 錯誤範例 | 原因 |
|----------|------|
| `MATERIALS_ROOT=D:\nas\materials` | Windows 本機路徑，Linux 容器無效 |
| `MATERIALS_ROOT=/mnt/nas/materials` | Linux mount 路徑；本系統用 smbprotocol，非本機掛載 |
| `MATERIALS_ROOT=\\10.9.82.22\CrownWork\...` | 重複指定 server／share；`\` 在 shell／compose 易被轉義 |
| `SMB_SERVER=10.9.82.22/CrownWork` | server 不可含路徑 |
| `MATERIALS_ROOT=教育訓練教材及考卷\materials` | 反斜線在跨平台 `.env`／compose 易出錯（程式會正規化，但仍應避免） |

### 5.4 設定載入

| 環境 | 載入方式 |
|------|----------|
| 本機開發 | `backend/.env`；`config.py` 以**檔案位置**解析路徑，**不依賴**行程 cwd |
| Linux Docker | **`deploy/.env` 的 `TRAINING_*`** → `docker-compose.yml` 注入容器；映像**不含** `backend/.env` |
| 優先順序 | OS 環境變數 > `.env` > 程式預設值 |

變更 `.env` 後須**完整重啟**後端（uvicorn `--reload` 不監視 `.env`；`get_settings()` 有 cache）。  
Docker 部署改 `deploy/.env` 後須：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose up -d --force-recreate training-backend
```

### 5.4.1 Docker：`TRAINING_*` 與容器內變數對照

| `deploy/.env` | 容器內 | 用途 |
|---------------|--------|------|
| `TRAINING_SMB_SERVER` | `SMB_SERVER` | NAS 主機 IP／名稱 |
| `TRAINING_SMB_SHARE` | `SMB_SHARE` | SMB 共享名稱 |
| `TRAINING_SMB_AUTH_DOMAIN` | `SMB_AUTH_DOMAIN` | 教材登入自動補網域 |
| `TRAINING_MATERIALS_ROOT` | `MATERIALS_ROOT` | 教材根目錄（共享內） |
| `TRAINING_BACKUP_ROOT` | `BACKUP_ROOT` | 備份根目錄 |
| `TRAINING_EXAM_SMB_USERNAME` | `EXAM_SMB_USERNAME` | 考卷 service 帳號 |
| `TRAINING_EXAM_SMB_PASSWORD` | `EXAM_SMB_PASSWORD` | 考卷 service 密碼 |
| `TRAINING_CREDENTIAL_SECRET` | `CREDENTIAL_SECRET` | Fernet 金鑰（`enc:` 解密） |

完整 AD／SMTP 映射見 `deploy/.env.example` 註解與 `deploy/docker-compose.yml`。

**常見誤解**：僅修改主機上的 `backend/.env` **不會**讓已運行容器讀到 SMB 設定；必須改 `deploy/.env` 並 recreate。

### 5.4.2 教材 NAS 登入與 AD 群組

- **Web 功能權限**：本地 RBAC（角色／職務）；教練、稽核、主管等不由 AD 群組對應。
- **NAS 檔案讀寫**：使用者於 UI 輸入個人 AD／NAS 帳密（interactive）；系統只驗 SMB 能否連線，**不查** AD 群組白名單。
- **實際誰能寫入 `materials/`**：由 **NAS 管理員在共享 ACL** 設定；非本系統設定檔。

### 5.4.3 機敏字串加密（Fernet）

| 項目 | 說明 |
|------|------|
| 演算法 | Fernet（AES-128-CBC + HMAC-SHA256） |
| 金鑰 | `TRAINING_CREDENTIAL_SECRET` → 容器 `CREDENTIAL_SECRET` |
| 適用 | `TRAINING_SMTP_PASSWORD=enc:...`、排程備份 NAS 密碼（DB） |
| 加密腳本 | `backend/scripts/encrypt_env_secret.py`（須在容器內執行，且容器已有金鑰） |

詳見 [MIGRATION_GUIDE.md](資料庫遷移/MIGRATION_GUIDE.md)「SMTP 密碼密件化」Docker 小節。

### 5.5 程式對應

| 模組 | 行為 |
|------|------|
| `backend/app/config.py` | 正規化 `MATERIALS_ROOT`／`BACKUP_ROOT`（`\`→`/`）；拒絕絕對路徑／UNC／磁碟代號；`env_file` 綁定 `backend/.env` |
| `backend/app/services/storage.py` | `normalize_smb_rel_path`／`_unc`：`/` 與 `\` 皆可拆段，產出一致 UNC；拒絕 `..` |
| `teaching_materials`／`exam` | 寫入 DB 的路徑一律 `/` |
| `database.py` | SQLite 以 `__file__` 推算專案根 `data/`（Docker 以 `/data` symlink 對齊） |
| `report.py`／`auth.py` | 字型依 OS 列候選路徑（Linux／macOS／Windows） |

### 5.6 驗證

**本機開發**（`backend/` 有 `.venv`）：

```bash
# Linux / macOS（於 backend/）
.venv/bin/python3 -c "from app.config import get_settings; s=get_settings(); print(s.smb_server, s.smb_share, s.materials_root, s.smb_configured)"

# Windows PowerShell（於 backend/）
.\.venv\Scripts\python.exe -c "from app.config import get_settings; s=get_settings(); print(s.smb_server, s.smb_share, s.materials_root, s.smb_configured)"
```

**ds1 Docker**（主機 `backend/` **無** `.venv`；須在容器內執行）：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose exec training-backend python -c \
  "from app.config import get_settings; s=get_settings(); \
   print('smb_configured=', s.smb_configured); \
   print(s.smb_server, s.smb_share, s.materials_root)"
```

單元測試：

```bash
# 專案根目錄
backend/.venv/bin/python3 tests/test_storage_unit.py
backend/.venv/bin/python3 tests/test_config_paths.py
```

（Windows 將 `backend/.venv/bin/python3` 改為 `backend\.venv\Scripts\python.exe`。）

預期：`smb_configured` 為 `True`，且 `materials_root` 僅含 `/` 分段。

### 5.7 常見錯誤對照

| 症狀 | 原因 | 處理 |
|------|------|------|
| `NAS 共享尚未設定（需 SMB_SERVER／SMB_SHARE）` | 執行中後端未讀到非空設定 | **本機**：檢查 `backend/.env` 後完整重啟；**Docker**：檢查 `deploy/.env` 的 `TRAINING_SMB_*` 並 `force-recreate` |
| 設定有值仍失敗 | OS 環境變數以空字串覆寫 `.env` | 清除空的 `SMB_*` 環境變數 |
| `0xc0000234`（NTSTATUS） | **AD 帳號已鎖定**（多次密碼錯誤） | 請 IT 解鎖；解鎖前勿再試登入 |
| `無法連線 NAS (IP)：...`（非上述） | 網路、帳密錯誤、NAS ACL、容器 445 被擋 | 驗證 `\\{SMB_SERVER}\{SMB_SHARE}`；必要時查 compose 註解（bridge 連 NAS 445） |
| `encrypt_env_secret.py` 報未設金鑰 | 金鑰只寫在 `backend/.env` 或容器未 recreate | 改寫 `deploy/.env` 的 `TRAINING_CREDENTIAL_SECRET` 並 recreate；或 `-e CREDENTIAL_SECRET=...` 一次性加密 |

## 6. 參考文件

- `backend/.env.example`（本機開發）
- `deploy/.env.example`（Docker 生產；`TRAINING_*` 前綴）
- `deploy/docker-compose.yml`（環境變數映射）
- [系統備援 NAS 儲存與排程備份 PLAN](../02-棕地專案/plans/已完成/20260612_系統備援_NAS儲存與排程備份_PLAN.md) §5.3、§5.7
- [教材上傳列管與教材庫 PLAN](../02-棕地專案/plans/20260617_教材上傳列管與教材庫_PLAN.md)
- [資料庫遷移/MIGRATION_GUIDE.md](資料庫遷移/MIGRATION_GUIDE.md)（Docker SMTP 加密、AD 設定）
- [README.md](../../README.md)「NAS／SMB 與跨平台路徑」

## 7. 使用表單（環境變數欄位）

### 7.1 本機開發（`backend/.env`）

| 欄位 | 必填 | 格式 | 範例 |
|------|------|------|------|
| `SMB_SERVER` | 教材／考卷／備份皆需 | 主機名或 IP | `10.9.82.22` |
| `SMB_SHARE` | 同上 | 共享名稱（建議不含 `/`） | `CrownWork` |
| `SMB_AUTH_DOMAIN` | 建議（教材 interactive） | NAS 登入自動補網域；未設則用 `AD_DOMAIN`。含 `.` → `user@domain`；否則 → `DOMAIN\user` | `yourco.com` 或 `YOURCO` |
| `MATERIALS_ROOT` | 建議 | 共享內相對路徑，`/` 分段 | `教育訓練教材及考卷/materials` |
| `BACKUP_ROOT` | 排程備份 | 同上 | `教育訓練教材及考卷/backups` |
| `EXAM_SMB_USERNAME`／`EXAM_SMB_PASSWORD` | 考卷 service 模式 | 服務帳號 | （機敏，不入版控） |
| `CREDENTIAL_SECRET` | SMTP `enc:`／備份密碼加密 | Fernet 金鑰 | `Fernet.generate_key()` 產出 |

### 7.2 Docker 生產（`deploy/.env`）

| 欄位 | 對應容器內 | 說明 |
|------|------------|------|
| `TRAINING_SMB_SERVER` | `SMB_SERVER` | 同 7.1 |
| `TRAINING_SMB_SHARE` | `SMB_SHARE` | 同 7.1 |
| `TRAINING_SMB_AUTH_DOMAIN` | `SMB_AUTH_DOMAIN` | 同 7.1 |
| `TRAINING_MATERIALS_ROOT` | `MATERIALS_ROOT` | 同 7.1 |
| `TRAINING_BACKUP_ROOT` | `BACKUP_ROOT` | 同 7.1 |
| `TRAINING_EXAM_SMB_*` | `EXAM_SMB_*` | 同 7.1 |
| `TRAINING_CREDENTIAL_SECRET` | `CREDENTIAL_SECRET` | 同 7.1 |
| `TRAINING_SMTP_PASSWORD` | `SMTP_PASSWORD` | 建議 `enc:` 密文 |
