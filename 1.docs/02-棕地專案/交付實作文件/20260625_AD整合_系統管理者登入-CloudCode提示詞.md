# AD 整合：系統管理者登入 — Cloud Code 開發提示詞

**用途**：複製下方「§1 總提示詞」開場；每次只貼一個 Wave 提示詞（§2～§7）。  
**規格準據**：技術設計為**本次執行準據**；PLAN 為業務規格。  
**方案**：**方案乙**（AD 日常 + AD 斷線 Email OTP 備援 + break-glass 最後手段）。

---

## 1. 總提示詞（Session 開場，貼一次即可）

### 任務：教育訓練系統 — AD 整合（系統管理者登入）

#### 你的角色
你是本專案的全端工程師。嚴格依技術設計與 PLAN 實作，**不得自行擴充規格**（例如：不得新增第二個 break-glass、不得在 AD 正常時允許 Email OTP 取代 AD、不得本地儲存 AD 密碼）。

#### 必讀文件（依序）
1. 專案根目錄 `CLAUDE.md`（啟動、架構、規範）
2. **`1.docs/02-棕地專案/plans/20260612_AD整合_系統管理者登入_技術設計.md`**（Wave 分工、API、檔案落點，**本次執行準據**）
3. `1.docs/02-棕地專案/plans/20260612_AD整合_系統管理者登入_PLAN.md`（業務規格、驗收 §5.7）
4. `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md`（遷移模式）
5. 現行程式（修改前必讀）：
   - `backend/app/routers/auth.py`
   - `backend/app/auth_utils.py`
   - `backend/app/models.py`
   - `backend/app/config.py`（已有 NAS 設定，**追加** AD/JWT/SMTP，勿破壞 SMB）
   - `frontend/src/components/LoginPage.tsx`
   - `frontend/src/App.tsx`

#### 四條登入路徑（必須全部實作，不可混淆）
| 路徑 | 端點 | 說明 |
|------|------|------|
| **A** AD 日常 | `POST /auth/login/admin` | LDAPS + `IT_Admin`；JIT 建檔含 `email` |
| **D** Email OTP 備援 | `POST /auth/login/admin/email/request`、`/verify` | **僅 AD 不可達時**；不存 AD 密碼 |
| **B** break-glass | `POST /auth/login/local`、`/password/change` | 僅 `is_protected`；90 天密碼政策**只適用此路徑** |
| **C** 員工免密 | `POST /auth/login` | 不變；管理角色 → 403 |

#### 實作原則
- 語言：**繁體中文**（註解、溝通、報告）
- **一次只完成一個 Wave（W1～W6）**；完成後停下報告，等我確認再進下一 Wave
- **最小 diff**：不順手重構無關程式
- TypeScript **禁 `any`**；後端 **async/await**
- 資料庫變更：執行前說明備份；腳本放 `backend/migrations/`，冪等
- **機敏資料不得入版控**：`JWT_SECRET_KEY`、`SMTP_PASSWORD`、AD 密碼、OTP 明文
- AD `username`：**白名單** `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,19}$` + LDAP `escape_filter_chars`
- `SUPER_ADMIN_ROLE_NAMES` 是**本地 RBAC 角色名**，**不是** AD 群組；AD 准入只看 `IT_Admin`
- JIT 管理帳號：`is_trainee=false`；掛 `AD_ADMIN_ROLE_NAME`（預設 `系統管理`）
- 每 Wave 結束：`npm run lint`、`npm run build`（專案根目錄）；後端相關 Wave 加說明如何手動驗證

#### 環境
- 前端 base：`/training/`；API 代理 `/training/api` → `8000`
- 後端：`cd backend && export PYTHONPATH=$PYTHONPATH:. && .venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- 開發時 `AD_ENABLED=false` 可測路徑 B；路徑 A/D 需 IT 提供 DC／SMTP 或寫 mock 單測

#### 分支
請在 `feature/20260625-ad-auth` 上工作（若不存在則自 `main` 建立）。

#### 本次 Wave
（下方 §2～§7 擇一填入）

---

## 2. Wave W1 提示詞（基礎：設定、遷移、模型）

請實作 **Wave W1：設定、常數、遷移、模型、schemas**。

### 準據
技術設計 §4（W1）

### 要做的事
1. **擴充** `backend/app/config.py`：JWT、AD、SMTP、OTP、break-glass 等環境變數（見技術設計 §4.1）；保留既有 NAS 欄位
2. **新增** `backend/app/constants/auth.py`：`SUPER_ADMIN_ROLE_NAMES`、`AD_USERNAME_PATTERN`、`normalize_ad_username`、`is_super_admin_role`、`is_management_role`
3. **新增** `backend/migrations/add_ad_auth_user_fields.py`：
   - `users` 新欄位（含 `email`、`is_trainee` 等）
   - 新表 `admin_login_otps`
   - `admin` → `is_protected=1`；確保角色 `系統管理` 存在
4. **更新** `backend/app/models.py`：`User` 新欄位 + `AdminLoginOtp` 模型（若獨立表）
5. **更新** `backend/app/schemas.py`：登入／改密／OTP 相關 schema（可先定義，W3 再用）
6. **更新** `backend/app/init_db.py`：新帳號預設 `is_trainee=true`；`admin` 補 `is_protected`
7. **新增** `backend/.env.example`（若無則建）列出 AD/JWT/SMTP 變數（不含真實密碼）
8. `requirements.txt` 預留 `ldap3`（W2 使用，可 W1 一併加入）

### 禁止
- 本 Wave **不要**實作登入端點或前端
- 不要執行會清空資料的 `init_db()` 覆寫既有業務資料

### 驗收
- [ ] 遷移腳本可重複執行（冪等）
- [ ] `models.py` 與遷移欄位一致
- [ ] `config.py` 原有 SMB 設定仍可 `get_settings()` 正常載入

### 交付
- 列出新增／修改檔案
- 遷移執行指令與備份提醒
- **不要**開始 W2

---

## 3. Wave W2 提示詞（服務層）

請實作 **Wave W2：AD／密碼政策／JIT／Email OTP／SMTP 服務**。

### 前置
W1 已完成。

### 準據
技術設計 §5（W2）

### 要做的事
1. `backend/app/services/ad_auth.py` — LDAPS bind、`AdAuthResult`、群組檢查、`AdConnectionError`
2. `backend/app/services/jit_provision.py` — upsert、撞號 409、`email` 同步
3. `backend/app/services/password_policy.py` — 複雜度、90 天（僅 break-glass）
4. `backend/app/services/email_otp.py` — `is_ad_unreachable`、`can_use_email_fallback`、`request_otp`、`verify_otp`
5. `backend/app/services/smtp_mailer.py` — `send_otp_email`
6. **新增單元測試**（至少）：
   - `tests/test_password_policy.py`
   - `tests/test_ad_auth.py`（mock `ldap3`，不連真 DC）
   - `tests/test_jit_provision.py`
   - `tests/test_email_otp.py`（mock SMTP）

### 禁止
- 本 Wave **不要**改 `auth.py` 路由（留 W3）
- OTP **不得**明文寫 DB；SMTP 密碼不得 hardcode

### 驗收
- [ ] `cd tests && python3 -m pytest test_password_policy.py test_jit_provision.py -q` 通過（或專案慣用之 pytest 指令）
- [ ] `ldap3` 已加入 `requirements.txt`

### 交付
- 測試結果摘要
- **不要**開始 W3

---

## 4. Wave W3 提示詞（認證 API + 安全債）

請實作 **Wave W3：認證端點與 JWT 環境變數化**。

### 前置
W2 已完成。

### 準據
技術設計 §6（W3）、PLAN §5.4、§5.6

### 要做的事
1. **`backend/app/auth_utils.py`**：`JWT_SECRET_KEY` 改讀 `config`；`create_password_change_token`、`verify_password_change_token`
2. **`backend/app/routers/auth.py`** 新增／調整：
   - `POST /auth/login/admin`
   - `POST /auth/login/admin/email/request`
   - `POST /auth/login/admin/email/verify`
   - `POST /auth/login/local`
   - `POST /auth/password/change`
   - 調整 `POST /auth/login`：管理角色 403；`0000` 受 `LOGIN_BYPASS_ENABLED` 控制；**移除 debug print**
3. **`check_permission` / `check_any_permission`**：超級角色字串改引用 `constants/auth.py`
4. 登入成功寫稽核 log（emp_id、auth_src、IP；無密碼／OTP）
5. 統一回應格式：`auth_src` = `ad` | `local` | `email_fallback`

### 錯誤碼（必須符合技術設計）
- AD 連線失敗 → 503 + 可選 `fallback: "email"`
- AD 正常時 email/request → 400
- OTP 頻率 → 429
- break-glass 鎖定 → 423

### 禁止
- 不要改 `exam_center`／`training` 隔離（W4）
- 不要改前端（W5）

### 驗收
- [ ] Swagger `/docs` 可看到新端點
- [ ] `AD_ENABLED=false` 時 `/login/admin` → 503；`/login/local` 仍可測（需 W1 遷移後 admin 有 password_hash）
- [ ] 管理角色經 `/auth/login`（路徑 C）→ 403

### 交付
- curl 或 Swagger 測試範例（每路徑至少一則）
- **不要**開始 W4

---

## 5. Wave W4 提示詞（is_trainee 隔離 + admin 保護）

請實作 **Wave W4：`is_trainee` 訓練流程隔離與 break-glass API 保護**。

### 前置
W1 已完成（W3 可並行完成後再驗整合端）；建議 W3 已完成以便端到端測管理登入後行為。

### 準據
技術設計 §7（W4）、PLAN §5.3.2

### 要做的事
1. **`backend/app/access_scope.py`**：新增 `apply_trainee_filter`；`get_scope_emp_ids(..., trainees_only=False)`
2. **`backend/app/routers/exam_center.py`**：
   - `get_my_exams`：`is_trainee=false` → 空列表
   - **移除**管理員可看全部應考計畫之捷徑（改依受課規則 + trainee）
   - 成績查詢範圍加 `trainees_only`  where 適用
3. **`backend/app/routers/training.py`**：`get_training_form_users`、報到統計、應到人數計算 — 排除非 trainee
4. **`backend/app/routers/admin.py`**：
   - `get_users` 加 `trainees_only=true` 預設
   - `get_department_users` 加 trainee 過濾
   - `update_user` / `delete_user`：改為檢查 `is_protected`（非僅 `emp_id=='admin'`）

### 禁止
- 不要改登入端點邏輯（除非 W3 遺漏且為修 bug）
- 不要改前端

### 驗收
- [ ] PLAN §5.7 #6、#7：JIT 帳號不出現在考試中心／受課挑選（可用 DB 手動建 `is_trainee=false` 測試帳號）
- [ ] PLAN §5.7 #16：`is_protected` 帳號不可刪／不可停用

### 交付
- 說明各檔修改點
- **不要**開始 W5

---

## 6. Wave W5 提示詞（前端）

請實作 **Wave W5：登入頁、改密頁、路由守衛**。

### 前置
W3 已完成（API 可用）。

### 準據
技術設計 §8（W5）

### 要做的事
1. **`frontend/src/components/LoginPage.tsx`**（或拆分元件）：
   - 員工登入（現有）
   - **AD 管理登入** tab：`username` + `password` → `/auth/login/admin`
   - AD 503 → 顯示 Email OTP 流程（request + verify）
   - **本地緊急登入**（摺疊）：`/auth/login/local`
   - 前端 AD username 白名單與後端一致
2. **新增** `frontend/src/components/ChangePasswordPage.tsx` + 路由 `/login/change-password`
3. **新增** `frontend/src/utils/authGuards.ts`：`hasFunction`、`hasAdminMenu`
4. **`frontend/src/App.tsx`**：`/admin/*` 改 `hasAdminMenu`（**勿**僅 `role === 'Admin'`）
5. **`frontend/src/types.ts`**：`auth_src`、`LoginResponse` 擴充

### 禁止
- 不要改後端業務邏輯（除非 API 契約不符）
- 不要改無關管理頁 UI

### 驗收
- [ ] `npm run lint` && `npm run build`（專案根目錄）通過
- [ ] 員工登入路徑不受影響
- [ ] AD 登入表單可輸入 `it01` 類帳號（非純數字員編）

### 交付
- 手動測試步驟（含 mock／無 AD 時 UI 行為）
- **不要**開始 W6

---

## 7. Wave W6 提示詞（驗收 + Security Review）

請執行 **Wave W6：驗收與 Security Review**。

### 前置
W1～W5 已完成。

### 要做的事
1. 依 PLAN §5.7 **#1～#25** 逐項測試，記錄於  
   `1.docs/02-棕地專案/reviews/20260625_AD整合_驗收記錄.md`（新建）
2. 執行 Security Review，產出  
   `1.docs/02-棕地專案/reviews/20260625_AD整合_security-review.md`  
   格式參考 `reviews/20260618_建議事項_security-review.md`
3. 必查：LDAP injection、OTP 濫發、JWT 硬編碼、密碼／OTP 不入 log、路徑 D 僅 AD 斷線、`is_trainee` 隔離
4. 若發現 **High** 漏洞：修復後再更新報告；未修復不得標記完成
5. 更新技術設計檔案頂部「狀態」為「實作完成（待上線）」並勾選各 Wave 檢查清單（若技術設計內有）

### 禁止
- 不要新增規格外功能
- 不要略過 Security Review

### 交付
- 驗收記錄表（通過／失敗／需 IT 環境）
- Security Review 報告連結與結論
- 建議上線前 `.env` 檢查清單

---

## 8. 附錄：常見錯誤（Cloud Code 請避免）

| 錯誤 | 正確做法 |
|------|----------|
| 把 `IT_Admin` 寫進 `SUPER_ADMIN_ROLE_NAMES` | AD 群組 ≠ 本地角色名 |
| AD 正常時允許 Email OTP | 必須 `is_ad_unreachable()` 且回 400 |
| 在 DB 存 AD 密碼 hash | 僅 break-glass 有 `password_hash` |
| 90 天強制改密套在 AD 帳號 | 僅路徑 B break-glass |
| 前端只用 `role === 'Admin'` | JIT 角色是 `系統管理`，用 `functions` |
| `get_my_exams` 管理員看全部計畫 | `is_trainee=false` 不應考 |
| OTP 明文存 DB | 只存 hash |
| 覆寫 `config.py` 刪掉 SMB 設定 | 只能追加欄位 |

---

## 9. 附錄：`.env` 開發範例（勿提交真實密碼）

```env
JWT_SECRET_KEY=dev-only-change-me
AD_ENABLED=false
AD_FALLBACK_EMAIL_ENABLED=true
LOGIN_BYPASS_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USE_TLS=true
BREAK_GLASS_EMP_ID=admin
INITIAL_ADMIN_PASSWORD=              # 僅首次遷移注入 break-glass
```

---

**最後更新**：2026-06-25
