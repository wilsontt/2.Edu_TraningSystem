# AD 整合：系統管理者登入實作計劃 (PLAN)

**文件類型**：實作計劃（PLAN，僅設計，不含程式碼）
**建立日期**：2026-06-12
**狀態**：草案（待核可後進入技術設計與實作）
**對應需求**：以 AD 群組 `IT_Admin` 控管系統管理者登入，取代本地自建管理者帳號控管。

> 本計劃依使用者全域規範採 7 大結構：目的／範圍／權責／名詞解釋／作業內容／參考文件／使用表單。

---

## 1. 目的

1. 將「系統管理者」之**身分驗證**改由企業 AD（Active Directory）負責，僅允許 AD 群組 **`IT_Admin`** 之成員登入管理端。
2. 取消本地自建之管理者帳號控管負擔（不再以本地密碼／自建帳號管理系統管理者）。
3. **保留本地 RBAC**（角色、功能選單、部門可視範圍）作為**授權**依據；AD 僅負責「**是誰**」與「**能否進入管理端**」。
4. 一併清理現存安全債（JWT 金鑰硬編碼、驗證碼後門 `0000`），確保上線安全基線。

---

## 2. 範圍

### 2.1 涵蓋範圍（In Scope）

- 新增「管理端 AD 登入」流程（LDAPS bind + 群組檢查）。
- AD 驗證通過後之 **JIT（Just-In-Time）使用者佈建**：自動建立／更新本地 `users` 並掛上系統管理角色。
- 認證設定**環境變數化**（AD 連線、JWT 金鑰、後門開關）。
- 既有 `auth.py` 權限判斷與超級角色判定之相容處理。

### 2.2 不涵蓋範圍（Out of Scope）

- **一般員工登入維持現狀**（工號＋圖形驗證碼免密），本計劃不改動。
- AD 群組與本地角色之**細粒度多對多映射**（本期僅單一群組 `IT_Admin` → 單一管理角色）。
- AD 密碼修改、AD 帳號生命週期管理（屬 AD／IT 既有流程）。
- SSO / OIDC（Entra ID、ADFS）：本期採 **LDAPS**，OIDC 留待未來評估。

### 2.3 已確認決策

| 決策點 | 結論 |
|--------|------|
| 認證協定 | **LDAPS**（帳密直連 DC，內網單機，改動最小） |
| 套用範圍 | **僅管理端／特權角色**走 AD；一般員工不變 |
| 准入群組 | 僅 AD 群組 **`IT_Admin`** |
| 授權來源 | **本地 RBAC**；AD 只決定「能否進管理端」 |
| 帳號佈建 | **JIT**：首次 AD 登入且屬 IT_Admin → 自動 upsert 本地 User |

---

## 3. 權責

| 角色 | 權責 |
|------|------|
| 後端開發 | 實作 `ad_auth` 服務、`/auth/login/admin` 端點、JIT 佈建、設定環境變數化 |
| 前端開發 | 管理端登入入口（帳密表單）、錯誤訊息分流（401／403／503） |
| IT／AD 管理員 | 提供 DC 位址、Base DN、UPN 格式、`IT_Admin` 群組 DN、服務測試帳號 |
| 系統管理者（業主） | 確認哪些 AD 帳號屬 `IT_Admin`；核可上線 |
| 測試 | 依第 5.7 節驗收案例執行並記錄 |

---

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| **AD** | Active Directory，企業目錄服務 |
| **LDAPS** | LDAP over SSL/TLS（埠 636），加密的目錄查詢／驗證協定 |
| **bind** | 以帳號密碼向 AD 進行繫結驗證，成功即代表帳密正確 |
| **DN / Base DN** | Distinguished Name；Base DN 為搜尋起點（如 `DC=yourco,DC=local`） |
| **UPN** | User Principal Name，如 `user@yourco.local` |
| **sAMAccountName** | AD 的傳統登入帳號（如 `it01`） |
| **memberOf** | AD 使用者所屬群組清單屬性 |
| **JIT 佈建** | 首次登入時即時於本地建立／更新使用者資料 |
| **RBAC** | 本系統角色基礎存取控制（角色＋功能＋部門範圍） |

---

## 5. 作業內容

### 5.1 整體流程

```
管理端登入頁（帳號/密碼）
  → POST /api/auth/login/admin
     1. 檢查 AD_ENABLED 是否啟用（否 → 503）
     2. LDAPS bind 驗證帳密（失敗 → 401）
     3. 讀取 memberOf，檢查是否含 IT_Admin（否 → 403）
     4. JIT：upsert 本地 users（掛系統管理角色）
     5. 簽發 JWT（夾帶 auth_src=ad）
  → 回傳 token 與 user（functions 由本地 RBAC 決定）
```

> 一般員工流程（`/api/auth/login`、QRcode 登入）**不變**。

### 5.2 設定環境變數化（新增 `backend/app/config.py`）

以 `pydantic-settings` 集中讀取，**禁止硬編碼**：

| 變數 | 用途 | 範例 |
|------|------|------|
| `JWT_SECRET_KEY` | 取代 `auth_utils.SECRET_KEY` 硬編碼 | `openssl rand -hex 32` 產生 |
| `AD_ENABLED` | AD 登入總開關 | `true` |
| `AD_SERVER_URI` | DC 位址 | `ldaps://dc.yourco.local:636` |
| `AD_BASE_DN` | 搜尋起點 | `DC=yourco,DC=local` |
| `AD_DOMAIN` | UPN／網域 | `yourco`（組 `user@yourco.local`） |
| `AD_ADMIN_GROUP` | 准入群組 CN | `IT_Admin` |
| `AD_ADMIN_ROLE_NAME` | 對應本地角色名稱 | `系統管理` |
| `LOGIN_BYPASS_ENABLED` | 驗證碼後門 `0000` 開關（預設關閉） | `false` |

> `.env` 必須列入 `.gitignore`（現況已忽略 `.env`，需再確認）。

### 5.3 AD 驗證服務（新增 `backend/app/services/ad_auth.py`）

- 套件：`ldap3`（需加入 `requirements.txt`）。
- 函式：
  - `authenticate_ad(username, password) -> dict | None`：LDAPS bind；成功回 `{username, display_name, groups, mail}`。
  - `is_in_admin_group(groups) -> bool`：比對 `AD_ADMIN_GROUP`（以 `CN=IT_Admin,` 前綴判斷，忽略大小寫）。
- 連線失敗、帳密錯誤、查無使用者一律回 `None`（端點轉成 401）。

### 5.4 新增端點 `POST /api/auth/login/admin`（於 `auth.py`）

- Request：`{ username, password }`。
- 行為：依 5.1 流程；JIT upsert 時，`users.role_id` 指向 `AD_ADMIN_ROLE_NAME` 對應角色。
- Response：與既有 `/login` 對齊（`access_token`、`user.functions` 等），另於 JWT payload 加 `auth_src=ad`。
- 與現有 `/login` **並存**，不破壞既有免密流程。

### 5.5 資料模型微調（需遷移，`models.User`）

| 新欄位 | 型別 | 用途 |
|--------|------|------|
| `auth_source` | String，預設 `local` | 區分 `local` / `ad` |
| `ad_username` | String，nullable | 對應 AD 帳號 |
| `last_login_at` | DateTime，nullable | 稽核用 |

> 遷移依 `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md` 模式；執行前備份資料庫。

### 5.6 安全債清理（同批處理）

1. `auth_utils.SECRET_KEY` → 改讀 `settings.jwt_secret_key`（**上線前必修**）。
2. 登入與 QRcode 登入之 `answer == "0000"` 後門 → 受 `LOGIN_BYPASS_ENABLED` 控制，生產環境關閉。
3. `check_permission` / `check_any_permission` 內以字串比對超級角色（`Admin`、`System Admin`、`系統管理`）→ 收斂為集中常數，避免 AD 角色名不一致導致授權失效。
4. 移除 `auth.py` 內 `print(...)` 之敏感除錯輸出（captcha、登入細節）。

### 5.7 驗收條件

| # | 案例 | 期望 |
|---|------|------|
| 1 | 正確 IT_Admin 帳密 | 200，取得 token，可進管理端 |
| 2 | 正確帳密但非 IT_Admin | 403「非 IT_Admin 群組」 |
| 3 | 錯誤密碼 | 401 |
| 4 | `AD_ENABLED=false` | 503 |
| 5 | 首次 IT_Admin 登入 | 本地自動建立 user，掛系統管理角色 |
| 6 | 第二次登入 | 不重複建立，更新 `last_login_at` |
| 7 | 一般員工原流程 | 不受影響，仍可工號＋驗證碼登入 |
| 8 | 程式碼掃描 | 無硬編碼金鑰；後門預設關閉 |

---

## 6. 參考文件

- `backend/app/routers/auth.py`（現行登入、權限判斷）
- `backend/app/auth_utils.py`（JWT 簽發，待改環境變數）
- `backend/app/models.py`（`User`、`Role`、`SystemFunction`）
- `1.docs/00-專案總覽/角色與權限管理架構說明.md`（RBAC 與權限範圍）
- `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md`（遷移流程）
- `ldap3` 套件文件（LDAPS bind / search）

---

## 7. 使用表單（欄位說明）

### 7.1 管理端登入請求 `AdminLoginRequest`

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `username` | string | 是 | AD sAMAccountName（如 `it01`） |
| `password` | string | 是 | AD 密碼（僅用於即時 bind，不落地儲存） |

### 7.2 登入回應（與既有 `/login` 對齊）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `access_token` | string | JWT |
| `token_type` | string | `bearer` |
| `user.emp_id` | string | 對應本地使用者（= AD username） |
| `user.name` | string | AD displayName |
| `user.role` | string | 本地角色（系統管理） |
| `user.functions` | string[] | 本地 RBAC 功能碼清單 |

### 7.3 `users` 新增欄位

| 欄位 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `auth_source` | string | `local` | `local` / `ad` |
| `ad_username` | string | null | AD 帳號 |
| `last_login_at` | datetime | null | 最近登入時間 |

---

## 8. 風險與待確認

| 項目 | 說明 |
|------|------|
| UPN 格式 | 需 IT 確認登入是 `user@domain.local` 或 `DOMAIN\user`；影響 bind 字串 |
| 群組巢狀 | 若 IT_Admin 為巢狀群組成員，`memberOf` 可能不含；必要時改用 `LDAP_MATCHING_RULE_IN_CHAIN` |
| 憑證信任 | LDAPS 需信任 DC 憑證；自簽憑證須佈署 CA |
| 服務帳號 | 若改用 service account 先 bind 再查 user，需另備帳號（本期採使用者自身 bind） |
| 斷網情境 | DC 不可達時管理端將無法登入；是否保留 1 個本地緊急管理帳號（break-glass）待業主決定 |

---

**最後更新**：2026-06-12
