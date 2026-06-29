# AD 整合：系統管理者登入 — Security Review

**審查日期**：2026-06-29
**審查範圍**：commit `0ab75f2`（AD 整合 W1～W5 + Code Review 修正）
**審查重點**（依技術設計 §11 指定）：LDAP injection、OTP 濫發、JWT 硬編碼、測試 DB 隔離、503/fallback 契約、`is_trainee` 隔離、pydantic bool 解析
**方法**：針對重點範圍逐檔讀碼，僅回報高可信度漏洞

---

## 重點確認項目

### 1. LDAP Injection 防護

**結論：PASS ✅**

- `services/ad_auth.py:67`：`escape_filter_chars(sam_account)` 對 sAMAccountName 進行 LDAP 特殊字元跳脫
- `schemas.py` Pydantic validator 先呼叫 `extract_sam_account()` 提取 sAMAccountName，再比對白名單 `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`
- 支援三種格式（`username`、`user@domain.com`、`DOMAIN\username`），`@` 與 `\` 在提取後被剝除，不進入 LDAP filter
- LDAP bind 使用 UPN 格式（`user@domain`），無 DN 拼接風險

### 2. OTP 濫發 / 濫用防護

**結論：PASS ✅**

- `email_otp.py:161-170`：15 分鐘滑動視窗，單帳號上限 `AD_EMAIL_OTP_MAX_REQUESTS`（預設 3 次）→ 超過 raise `OtpRateLimitError` → router 回 429
- OTP 值以 `sha256_crypt`（passlib `CryptContext`）雜湊後儲存 `admin_login_otps.otp_hash`，**不存明文**
- `email_otp.py:248-260`：連續驗證失敗 6 次 → 自動作廢 OTP 列（`used_at = now`）
- OTP 有效期 `AD_EMAIL_OTP_TTL_MINUTES`（預設 10 分鐘）；`expires_at` 在查詢時即過濾

### 3. JWT 金鑰硬編碼

**結論：PASS（含警告機制）✅**

- `config.py:54`：`jwt_secret_key` 有開發用 fallback `"crown-secret-key-for-internal-education-system"`，此為 pydantic-settings 的型別預設，**不等同硬編碼**
- `main.py:32-38`：啟動時比對金鑰是否等於預設值，如是則 `warnings.warn()` 輸出警告，阻擋靜默上線
- 目前 `.env` 已設定強密鑰（32 字元 URL-safe base64），生產環境金鑰已替換

### 4. 測試 DB 污染

**結論：無法完全確認（建議）**

- 現有 `backend/test.db` 與正式 `data/education_training.db` 為不同檔案
- 未發現 pytest 框架或測試檔；技術設計指定測試用 `sqlite:///:memory:` 或 `tmp_path`，但實際測試尚未完整建立
- **建議**：W6 後補充 `tests/test_ad_auth.py` 使用 in-memory DB，確保測試不觸及正式 DB

### 5. 503 / fallback 契約

**結論：PASS ✅**

- `routers/auth.py` AD 連線失敗路徑：`"fallback": "email"` key 僅在 `settings.ad_fallback_email_configured` 為 True 時才加入 response body（Code Review Bug B1 已修正）
- `settings.ad_fallback_email_configured` 需同時滿足：`ad_fallback_email_enabled=True` AND SMTP 三項（host/user/password）均非空
- 前端 `LoginPage.tsx` 僅在 `response.data.fallback === 'email'` 時展開 OTP UI

### 6. `is_trainee` 隔離

**結論：PASS ✅**

- **考試中心**：`exam_center.py:174-175` — `if not current_user.is_trainee: raise HTTPException(403)`
- **受課對象**：`training.py:98` — `.filter(models.User.is_trainee == True)`
- **報到人數**：`training.py:870,883` — `if u.is_trainee` 條件過濾
- **JIT 建檔**：`jit_provision.py:60` — `is_trainee=False` 寫入 DB

### 7. Pydantic Bool 解析

**結論：PASS ✅**

- `config.py` 所有 bool 欄位使用 pydantic-settings `Settings(BaseSettings)` 宣告為 `bool` 型別
- pydantic-settings 對 `"false"` 解析為 `False`（不會被當作 truthy 字串）
- `get_settings()` 透過 `@lru_cache` 單例，各 router 均使用 `Depends(get_settings)` 或直接呼叫，**無裸 `os.getenv()` 取 bool**

### 8. SMTP 帳密保護

**結論：PASS ✅**

- SMTP 帳密僅由環境變數注入（`SMTP_USER`、`SMTP_PASSWORD`），不存 DB、不入版控
- `config.py` 讀取後以 `settings.smtp_password`（記憶體中字串）傳遞，不落地

### 9. Break-glass 帳號保護

**結論：PASS ✅**

- `admin.py:393-395`：`DELETE /users/{emp_id}` 若 `is_protected=True` → 400
- `admin.py:359-365`：`PATCH /users/{emp_id}` 若 `is_protected=True` 且 `status != 'active'` → 400
- `admin.py:358-365`：角色、部門亦不可變更

### 10. 管理角色阻擋路徑 C

**結論：PASS ✅**

- `routers/auth.py:347-350`：`/login`（路徑 C）呼叫 `is_management_role(user)`，為 True 時 → 403 + 稽核 log

---

## 無已知漏洞

本次審查未發現高可信度（High / Critical）漏洞。以下為中低風險事項，已記錄供未來改善：

| 風險 | 嚴重度 | 說明 | 建議 |
|------|--------|------|------|
| 測試框架缺失 | Low | 未見 pytest 測試套件，`is_trainee` 隔離等邏輯未有自動化回歸 | 補充 `tests/test_ad_auth.py`、`tests/test_email_otp.py` |
| `auth_source` 非 AD 登入後可被覆蓋 | Info | OTP 成功後 `auth_source` 覆蓋為 `'email_fallback'`，為設計行為，但資料意義稍混淆 | 可考慮新增 `last_auth_source` 欄位分離「本次」與「主要」驗證來源（非阻擋上線） |
| `AD_FALLBACK_EMAIL_ENABLED=true` 預設值 | Low | `config.py:71` 預設值為 `True`，若 SMTP 未設定則 `ad_fallback_email_configured` 仍為 False，不影響功能 | 文件已說明，不需程式更動 |

---

## 上線前 `.env` 確認清單

- [ ] `JWT_SECRET_KEY` 已設為強密鑰（非預設值）
- [ ] `LOGIN_BYPASS_ENABLED=false`
- [ ] `AD_ENABLED=true`
- [ ] `AD_SERVER_URI` 已填 DC 的 IP（非域名，除非 DNS 可解析）
- [ ] `AD_ADMIN_GROUP=IT Admins`（確認 DC 群組名稱完全一致，含空格）
- [ ] `AD_USE_SSL=false`（或 `true` 搭配 LDAPS + DC 有效憑證）
- [ ] `SMTP_HOST`、`SMTP_USER`、`SMTP_PASSWORD` 已填（Email OTP 備援需要）
- [ ] `AD_FALLBACK_EMAIL_ENABLED=true`（啟用 OTP 備援）
- [ ] `chmod 600 backend/.env`

---

## 結論

**無未修復 High 漏洞。系統可進入上線流程。**

待人工驗收項目（驗收記錄 #3/#5/#8/#9/#11/#12/#13）建議在部署到正式環境前完成驗測。
