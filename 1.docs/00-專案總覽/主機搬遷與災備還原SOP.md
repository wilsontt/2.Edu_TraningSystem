# 主機搬遷／災備還原 SOP（A → B）

**文件類型**：長青維運 SOP  
**最後更新**：2026-07-15  
**適用**：Linux Docker 生產（企業入口 `enterprise-portal`／EIP 整合部署）  
**責任邊界**：**僅本系統（線上教育訓練）可完整還原**；不涵蓋整台企業入口（EIP）或其他子系統之災備  
**預設情境**：**B 主機與 A 共用同一 NAS**（相同 `SMB_SERVER`／`SHARE`／`MATERIALS_ROOT`／`BACKUP_ROOT`）  
**不適用**：僅本機開發環境互相複製（可參考本文件精神，路徑改為本專案 `data/`、`backend/.env`）

---

## 1. 目的

定義教育訓練系統自 **A 主機完整移轉至 B 主機**，或 **A 損壞後於 B 災備還原** 時，必須備份、搬移、還原與驗收的作業步驟，確保：

- 業務資料（角色、權限、計畫、報到、考試、系統管理設定等）一致；
- NAS 教材／考卷實體檔可開啟下載（共用 NAS 時不需複製實體檔）；
- 環境變數與 Fernet 金鑰正確，登入／寄信／排程備份可用。

## 2. 範圍

| 涵蓋 | 不涵蓋 |
|------|--------|
| 本系統業務 DB（`${DATA_ROOT}/training/`） | 企業入口（EIP）其他服務／volume／反向代理整機搬遷 |
| EIP `deploy/.env` 中與本系統有關的 **`TRAINING_*`**（實務建議整份檔備援，見 §4、§5.1） | 把「整份 EIP 災備」宣稱已由本 SOP 完成 |
| 共用 NAS 連線驗證、B 上訓練容器起服務與驗收 | 產品內「一鍵還原」UI／API（現行無） |
| 排程備份 ZIP 作為 DB 第二來源 | Windows／macOS 本機開發日常備份；本專案 `backend/.env` 當正式權威設定 |
| §5.8 換 NAS 例外（非預設） | 將「僅 ZIP」當成完整主機備份 |

## 3. 權責

| 角色 | 責任 |
|------|------|
| 部署／維運 | 執行本 SOP、保管含密環境檔、停／啟訓練容器、驗證檢查清單 |
| IT／NAS 管理 | 確認 **B→同一 NAS** 網路與 SMB ACL（預設不搬檔） |
| IT／AD | 確認 B 可連 DC（若啟用 AD 登入） |
| EIP／入口維運 | 若 B 亦需跑入口本體或其他子系統，另依 EIP 自身搬遷程序（**超出本 SOP**） |
| 系統開發 | 維護本文件與 [生產部署指南](生產部署指南.md) 一致 |

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| **A／B 主機** | 舊／新 Docker 主機 |
| **本系統** | 線上教育訓練（`training-backend`／`training-frontend`） |
| **EIP** | 企業入口（`enterprise-portal`）；本系統以 Docker Compose 整合於其 `deploy/` |
| **業務 DB** | `${DATA_ROOT}/training/education_training.db`（容器內多為 `/data/education_training.db`） |
| **排程備份 ZIP** | NAS `BACKUP_ROOT` 下 `education_training_backup_YYYYMMDD_HHMM.zip`；**僅含 DB + manifest，不含環境檔、不含教材實體檔** |
| **EIP `deploy/.env`** | 路徑例：`/opt/apps/enterprise-portal/deploy/.env`。此檔屬 **EIP 部署目錄**，內含各服務變數；**本系統正式環境變數為其中的 `TRAINING_*`**（Compose 映射至容器內無前綴變數，見 [生產部署指南](生產部署指南.md)） |
| **本專案 `backend/.env`** | **僅本機開發**用；容器映像**不含**此檔。**正式搬機不得以它取代 `deploy/.env` 的 `TRAINING_*`** |
| **`TRAINING_CREDENTIAL_SECRET`** | Fernet 金鑰；與 A **必須相同**，否則 DB／環境檔內 `enc:` 密文無法解密 |
| **共用 NAS（本 SOP 預設）** | B 指向與 A **相同**的 `SMB_SERVER`／`SHARE`／`MATERIALS_ROOT`／`BACKUP_ROOT`；**不複製**教材／考卷實體檔 |

### 4.1 環境變數：本系統 vs EIP（必讀）

正式機上**不是**「本系統一份 `.env` + EIP 再一份」兩套平行權威設定：

| 你要備份什麼 | 實際對應 | 本 SOP 要求 |
|--------------|----------|-------------|
| 本系統正式環境變數 | EIP `deploy/.env` 裡的 **`TRAINING_*` 區塊** | **必備**（金鑰、SMB、AD、SMTP、JWT 等） |
| EIP 整份 `deploy/.env` | 同一檔，另含入口／其他子系統變數 | **建議整份複製**（避免漏拷 `TRAINING_*`；且若 B 的 compose 與 A 同結構較不易出錯） |
| EIP 其他服務專屬設定／volume | 入口、其他子系統 | **非本 SOP 責任**；完整企業入口搬遷另案 |
| 本專案 `backend/.env` | 開發機 | **非正式權威**；Docker 搬機不以此為準 |

**實務建議**：A 關機前安全複製 **整份** `deploy/.env`；本系統還原時至少確保 B 上 `TRAINING_*`（含 `TRAINING_CREDENTIAL_SECRET`）與 A 一致。是否還原檔內「非 TRAINING_」變數，視 B 是否一併跑 EIP 其他服務而定——**跑其他服務時應依 EIP 程序處理，不要假設本 SOP 已涵蓋。**

## 5. 作業內容

### 5.1 完整備份清單（A 關機或切換前）

| # | 項目 | 建議來源／路徑 | 必要（共用 NAS） |
|---|------|----------------|------------------|
| 1 | 本系統業務 DB | `${DATA_ROOT}/training/education_training.db`（優先於排程 ZIP） | **必備** |
| 2 | 本系統環境設定 | EIP `deploy/.env`：**至少**完整 `TRAINING_*`；**建議整份** `deploy/.env` 離線保存 | **必備** |
| 3 | NAS 教材／考卷實體檔 | 共享內 `MATERIALS_ROOT` 等 | **不必複製**（確認 B 可連同一 NAS 即可） |
| 4 | 排程備份目錄（可選） | `BACKUP_ROOT` 下歷史 ZIP（災備稽核／第二來源） | 建議保留在 NAS，無需拷到 B |
| 5 | 程式／映像 | 與 A 相同版本之 git tag／映像（於 B 建置或 pull） | **必備** |
| 6 | EIP 其他子系統 | （非本表） | **不在本 SOP**；見 §2、§4.1 |

> **禁止**把「只有排程備份 ZIP」當成完整主機搬遷備份。  
> **禁止**備份 `.venv`／`node_modules` 當正式還原材料。  
> **禁止**用本專案 `backend/.env` 充當正式環境還原來源。

### 5.2 A 主機：備份步驟

1. 公告維護視窗；確認無進行中大批考試交卷。
2. 停止寫入（僅停訓練服務即可；是否停 EIP 其他服務依入口維運另行決定）：

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose stop training-backend
# 視需要一併 stop training-frontend
```

3. 複製本系統 DB（於 A 主機；路徑以實際 `DATA_ROOT` 為準）：

```bash
# 範例
sudo cp -a "${DATA_ROOT}/training/education_training.db" \
  "/secure-backup/$(date +%Y%m%d)_education_training.db"
# 另存 SHA256 以利搬移後核對
sha256sum "${DATA_ROOT}/training/education_training.db" | tee "/secure-backup/db.sha256"
```

4. 安全複製 **EIP** `deploy/.env`（路徑例：`/opt/apps/enterprise-portal/deploy/.env`）至離線／加密媒介（**不得**提交版控）。  
   - 本系統還原至少需要其中全部 **`TRAINING_*`**。  
   - **建議整份複製**該檔；勿只拷本專案目錄下的 `backend/.env`。  
5. （可選）確認 NAS `BACKUP_ROOT` 有最新成功 ZIP，作為 DB 第二來源。
6. **共用 NAS**：與 IT 確認 B 主機對同一 `SMB_SERVER`／`SHARE` 的連線與 ACL（讀教材、寫備份／考卷 service 帳號）。**不必**搬移 `MATERIALS_ROOT` 目錄內容。
7. 記錄：DB 檔名、sha256、`deploy/.env` 保管位置、映像版本／commit、「共用 NAS」勾選。

### 5.3 B 主機：還原步驟（共用 NAS）

#### 5.3.1 前置條件

- B 已可跑 Docker Compose（與企業入口 `deploy/` 結構一致，至少能起訓練服務）。
- 映像已建置或可 pull（與 A **同版**為佳）。
- B 已確認可到達 **與 A 相同** 的 NAS（防火牆／路由／SMB 帳號）。

#### 5.3.2 放置 DB 與環境

1. 準備 `${DATA_ROOT}/training/` 目錄。
2. 將備份 DB 覆寫為：

```text
${DATA_ROOT}/training/education_training.db
```

3. 核對 sha256 與 A 備份一致。
4. 還原環境設定至 B 的 EIP `deploy/.env`：  
   - **建議**：將 A 的整份 `deploy/.env` 放到 B 的 `/opt/apps/enterprise-portal/deploy/.env`（或與 A 相同之 deploy 路徑）。  
   - **最低要求**：B 上所有 **`TRAINING_*`**（尤其 `TRAINING_CREDENTIAL_SECRET`、SMB、AD、SMTP、JWT）與 A 一致。  
   - 若 B 的 `deploy/.env` 已有其他非訓練服務設定，合併時**不可覆蓋掉既有入口設定，也不可漏掉 `TRAINING_*`**——合併前先備份 B 現況。  
   - **不要**只把本專案 `backend/.env` 拷進容器或期望其生效。

**環境變數規則（共用 NAS，強制）：**

| 變數 | 規則 |
|------|------|
| `TRAINING_CREDENTIAL_SECRET` | **與 A 完全相同**（DB 內排程備份 NAS 密碼、環境檔內 SMTP `enc:` 皆靠它） |
| `TRAINING_SMB_*`／`TRAINING_MATERIALS_ROOT`／`TRAINING_BACKUP_ROOT` | **與 A 相同**（指向同一 NAS） |
| `TRAINING_EXAM_SMB_*` | **與 A 相同** |
| `TRAINING_AD_*`／`TRAINING_SMTP_*` | 原則與 A 相同 |
| `TRAINING_JWT_SECRET_KEY` | 建議與 A 相同（不同則僅令已發 JWT 失效，可接受） |

#### 5.3.3 啟動與 recreate

```bash
cd /opt/apps/enterprise-portal/deploy
docker compose up -d training-backend training-frontend
# 確認 .env 已注入（僅 restart 可能不重讀 .env）
docker compose up -d --force-recreate training-backend
```

健康檢查：

```bash
docker compose exec training-backend python -c \
  "from app.config import get_settings; s=get_settings(); \
   print('smb=', s.smb_configured, 'ad=', s.ad_configured)"
```

預期：`smb=`、`ad=`（若啟用）為 True。

#### 5.3.4 Schema／遷移

若 B 映像／程式版本與 A **相同**，且 DB 來自 A 現況，**通常不必重跑遷移**（遷移已在 A 的 DB 完成）。

若 B 映像較新（schema 有增量），依 [MIGRATION_GUIDE](資料庫遷移/MIGRATION_GUIDE.md) 在容器內依序執行缺漏腳本；執行前再備份 B 上這份 DB。

### 5.4 切換流量與收尾

1. 將反向代理／DNS／入口連結指向 B（若入口本身也在搬，依 EIP 程序；本 SOP 只要求使用者能開到 `/training/`）。
2. 確認使用者可開啟 `/training/`、登入、關鍵流程可用。
3. A 主機：保留停機狀態至驗收通過；通過後再下線或封存（依資安政策）。
4. 於「系統管理 → 排程備份」確認設定仍在（來自 DB），必要時測「立即備份」寫入同一 `BACKUP_ROOT`。

### 5.5 驗收檢查清單

| # | 檢查項 | 通過 |
|---|--------|------|
| 1 | B 上 DB sha256 與備份一致 | ☐ |
| 2 | B 的 `deploy/.env` 含完整 `TRAINING_*`；`TRAINING_CREDENTIAL_SECRET` 與 A 相同；SMTP／排程備份密文可解 | ☐ |
| 3 | SMB／MATERIALS／BACKUP 路徑與 A **相同**；`smb_configured` 為 True | ☐ |
| 4 | 緊急登入（break-glass）或 AD 管理登入成功 | ☐ |
| 5 | 員工登入後，訓練計畫／報到／成績等狀態與 A 一致（抽樣） | ☐ |
| 6 | 教材庫：既有套組可列表；**抽樣下載成功**（驗證共用 NAS 可達） | ☐ |
| 7 | 系統管理：角色／權限／人員／備份排程設定存在 | ☐ |
| 8 | 部門／成績 PDF 中文正常（Docker 字型） | ☐ |
| 9 | （建議）「立即備份」成功寫入 NAS `BACKUP_ROOT` | ☐ |

### 5.6 常見失敗

| 現象 | 原因 | 處理 |
|------|------|------|
| 畫面資料都在，教材下載失敗 | B 連不到同一 NAS，或 SMB／路徑與 A 不一致 | 核對 `TRAINING_SMB_*`／ACL／網路；**勿以為要拷檔**（共用 NAS） |
| 排程備份或 SMTP 解密失敗 | `CREDENTIAL_SECRET` 與 A 不同 | 改回 A 的 `TRAINING_CREDENTIAL_SECRET` 後 recreate |
| NAS 共享尚未設定 | 未設 `TRAINING_SMB_*`、只改了本專案 `backend/.env`、或未 recreate | 改 EIP `deploy/.env` + recreate；見 [生產部署指南](生產部署指南.md) §5.4 |
| 誤用本機路徑跑遷移 | Docker 主機無 `.venv` | `docker compose exec training-backend python migrations/...` |
| 只解壓排程 ZIP 當完整搬遷 | ZIP 無環境檔 | 依 §5.1 補齊 EIP `deploy/.env` 的 `TRAINING_*` |
| 入口其他功能壞了、訓練卻正常 | 只還原了訓練、未做 EIP 整機搬遷 | 屬預期邊界；入口問題改走 EIP 程序 |

### 5.7 與排程備份的關係

| 能力 | 排程備份 ZIP | 本 SOP 完整搬遷（共用 NAS） |
|------|--------------|------------------------------|
| 本系統業務 DB | ✓ | ✓（優先直接拷 volume DB） |
| EIP `deploy/.env`／`TRAINING_*` | ✗ | ✓ |
| NAS 教材實體 | ✗（已在同一 NAS） | 不拷檔；B 指向同一路徑 |
| 一鍵還原 UI | ✗（現行無） | 人工依本 SOP |

**災備典型情境（應用主機毀損、NAS 仍在）：**

1. 自 NAS 取最新成功 ZIP → 解壓 `education_training.db`（或有事先離線拷貝的 volume DB 更佳）。  
2. 搭配**事先離線保存的** EIP `deploy/.env`（至少 `TRAINING_*` 與 A 相同）。  
3. 於 B 依 §5.3 還原並驗收 §5.5。

### 5.8 例外：必須換 NAS 時

本 SOP **預設不換 NAS**。若例外需遷到新共享：

1. IT 將 A 側 `MATERIALS_ROOT`（及考卷目錄）完整同步至新共享並抽樣核對。  
2. B 的 EIP `deploy/.env` 改 `TRAINING_SMB_*`／`TRAINING_MATERIALS_ROOT`／`TRAINING_BACKUP_ROOT` 與必要帳密。  
3. `force-recreate training-backend`，再跑 §5.5（尤其教材下載與立即備份）。

細節路徑慣例見 [NAS與路徑跨平台慣例](NAS與路徑跨平台慣例.md)。

### 5.9 本機開發路徑（僅參考）

若 A／B 為**非 Docker**、直接跑本專案後端：權威設定為本專案 **`backend/.env`**（無 `TRAINING_` 前綴），DB 多為專案 `data/education_training.db`。步驟精神同 §5.2～§5.5，路徑對調即可。**正式生產請一律以 EIP `deploy/.env` 為準。**

## 6. 參考文件

- [生產部署指南.md](生產部署指南.md) — Docker、`TRAINING_*`、recreate、`backend/.env` 與 `deploy/.env` 分離  
- [NAS與路徑跨平台慣例.md](NAS與路徑跨平台慣例.md) — SMB 邏輯路徑  
- [資料庫遷移/MIGRATION_GUIDE.md](資料庫遷移/MIGRATION_GUIDE.md) — schema 遷移與 Docker 指令  
- [專案使用說明.md](專案使用說明.md) — 功能與備份說明  
- [20260612_系統備援_NAS儲存與排程備份_PLAN.md](../02-棕地專案/plans/已完成/20260612_系統備援_NAS儲存與排程備份_PLAN.md) §5.10 — 歷史還原概要（現行 ZIP 不含 materials）

## 7. 使用表單（搬遷紀錄）

| 欄位 | 說明 | 填寫 |
|------|------|------|
| 搬遷／災備日期 | YYYY-MM-DD | |
| 執行人 | 姓名／帳號 | |
| A／B 主機識別 | IP 或主機名 | |
| 情境 | ☑ 共用同一 NAS（預設）　☐ 換 NAS（見 §5.8） | |
| 環境檔備份 | ☐ 整份 EIP `deploy/.env`　☐ 僅抽出 `TRAINING_*`（不建議） | |
| DB 備份檔名 | | |
| DB sha256 | | |
| `deploy/.env` 保管處 | （勿寫入明文密碼） | |
| 映像／git 版本 | | |
| B→NAS 連線確認 | ☐ ACL／防火牆 OK | |
| 驗收 §5.5 | ☐ 全部通過 | |
| EIP 其他服務 | ☐ 不在本次範圍　☐ 另依 EIP 程序處理 | |
| 備註 | 異常與處置 | |
