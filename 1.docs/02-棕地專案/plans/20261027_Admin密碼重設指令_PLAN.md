# 本機 admin（break-glass）密碼重設指令｜PLAN

**建立日期**：2026-10-27
**狀態**：已與專案負責人對齊，實作中
**參考做法**：`1.出勤加班單系統/backend/prisma/reset-admin-password.ts`、`8.自動蒐集威脅情報AETIM/.../server/scripts/update-admin-password.ts`（僅參考，不修改）

## 1. 目的

提供「本機 admin（`emp_id=admin`，`is_protected=1`，路徑 B break-glass）」的正式改密碼方式：僅能在主機／容器內以 shell 執行，不提供 Web 端點，並取代「重跑遷移腳本並 export `INITIAL_ADMIN_PASSWORD`」的臨時做法。

## 2. 範圍

- 納入：新增 `backend/scripts/reset_admin_password.py`、單元測試、教育訓練文件（Docker 執行方式）。
- 不納入：AD 管理員密碼（由 DC 管理）、遷移腳本 `add_ad_auth_user_fields.py`（維持首次初始化用途，不修改）、JWT 撤銷機制、DB 稽核表、強制登出、強制下次登入改密碼。

## 3. 權責

| 角色 | 權責 |
|------|------|
| 專案負責人 | 已決議 §5.1 各項 |
| 部署負責人 | 於正式機依文件執行，並保管新密碼 |
| 開發人員 | 實作、測試、文件 |

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| break-glass | AD 不可用時的本機緊急登入帳號，`POST /api/auth/login/local` |
| 稽核 | 寫入 `audit` logger（與 `auth.py` 的 `_audit` 同格式），不寫 DB |

## 5. 作業內容

### 5.1 已對齊決議（2026-10-27）

| # | 決議 |
|---|------|
| 1 | JWT 為無狀態，重設後既有登入最長仍有效 `JWT_EXPIRE_MINUTES`（預設 480 分鐘），先接受此限制 |
| 2 | 不強制登出、不強制下次登入改密碼；`password_changed_at` 設為現在 |
| 3 | 稽核僅寫 logger |
| 4 | 不修改遷移腳本 |
| 5 | 對象為本機 admin，非 AD 管理員 |

### 5.2 設計

- 檔案：`backend/scripts/reset_admin_password.py`；執行：`python scripts/reset_admin_password.py`。
- 密碼來源：`NEW_ADMIN_PASSWORD` 環境變數，或 TTY 隱藏輸入兩次；非 TTY 且無環境變數則中止。
- 驗證：重用 `validate_password_complexity`（`password_min_length`，預設 12，含大小寫、數字、特殊字元）；另限制 UTF-8 長度 ≤ 72 bytes（bcrypt 上限）。
- 目標：`settings.break_glass_emp_id`；帳號不存在或 `is_protected` 為假則中止。
- 更新（單一 transaction）：`password_hash`（`auth_utils.hash_password`）、`password_changed_at=now`、`must_change_password=False`、`failed_login_count=0`、`locked_until=None`。
- 稽核：`audit` logger 輸出 `event=admin_password_reset emp_id=… auth_src=local ip=cli detail=os_user=…`，不含密碼。因 API 程序未替 `audit` logger 設 handler，腳本自行附加 stderr 與 `data/logs/admin_password_reset.log`（位於 `/data` volume，可持久保存）。
- 輸出：先印目標資料庫路徑；任何輸出不含明文密碼。
- 退出碼：0 成功；1 輸入或前置條件不符；2 未預期錯誤。

### 5.3 步驟

| 步驟 | 內容 |
|------|------|
| P1 | 實作腳本 |
| P2 | `tests/test_reset_admin_password.py`（in-memory DB） |
| P3 | 更新 `MIGRATION_GUIDE.md`、`CLAUDE.md`、`專案使用說明.md` |
| P4 | 正式機：重建 `training-backend` 映像（腳本在映像內，非 volume），依文件執行 |

### 5.4 驗證

- 單元測試：強度不符、兩次輸入不一致、admin 不存在、非 protected、超過 72 bytes、成功時欄位正確、稽核不含明文。
- 正式機：腳本回報成功；DB 查詢欄位；以新密碼經緊急登入頁登入成功、舊密碼失敗。

### 5.5 風險

- 既有 API 的 `audit` logger 沒有 handler，`auth.py` 內的稽核事件目前不會落地；本計畫不變更，另案評估。
- 重建 `training-backend` 會使後端短暫重啟。

## 6. 參考文件

| 文件 | 說明 |
|------|------|
| `backend/app/routers/auth.py` | break-glass 登入與 `_audit` |
| `backend/app/services/password_policy.py` | 密碼複雜度規則 |
| `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md` | 現行 Docker 遷移與初始密碼說明 |

## 7. 使用表單

無。
