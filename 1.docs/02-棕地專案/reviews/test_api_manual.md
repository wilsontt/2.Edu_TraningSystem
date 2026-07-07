# API 測試手冊

**版本**：v2.0  
**最後更新**：2026-07-06  
**適用**：本機開發（`http://localhost:8000`）與 Docker 生產（依反向代理路徑調整 Base URL）

---

## 1. 目的與前提

手動以 `curl` 或 FastAPI `/docs` 驗證 REST API。完整端點清單以執行中後端 **Swagger** 為準：`http://localhost:8000/docs`。

| 項目 | 說明 |
|------|------|
| Base URL | `http://localhost:8000/api` |
| 認證 Header | `Authorization: Bearer <access_token>` |
| Token 有效期 | 預設 8 小時 |
| 前端代理 | 開發時前端經 `/training/api/*` 轉發至後端 |

以下範例將 `YOUR_TOKEN` 替換為登入回應中的 `access_token`。

---

## 2. 認證與登入

### 2.1 員工免密登入（一般受訓者）

```bash
# 1. 取得驗證碼
curl -s "http://localhost:8000/api/auth/captcha" | jq .

# 2. 登入（替換 emp_id、captcha_id、answer）
curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": "YOUR_EMP_ID",
    "captcha_id": "CAPTCHA_ID",
    "answer": "CAPTCHA_ANSWER"
  }' | jq .

# 3. 驗證目前使用者與權限
curl -s "http://localhost:8000/api/auth/me" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

> **管理角色**（含 IT Admins）呼叫 `POST /auth/login` 應回 **403**，須改走路徑 A 或 B。

### 2.2 AD 管理登入（路徑 A）

需 `AD_ENABLED=true` 且帳號在 **IT Admins** 群組。

```bash
curl -s -X POST "http://localhost:8000/api/auth/login/admin" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your.ad.account",
    "password": "YOUR_AD_PASSWORD"
  }' | jq .
```

| HTTP | 情境 |
|------|------|
| 200 | 成功；回傳 `access_token`，JIT 建檔 `is_trainee=false` |
| 401 | AD 帳密錯誤 |
| 403 | 非 IT Admins 群組 |
| 503 | AD 未啟用；或 DC 不可達（body 可能含 `"fallback": "email"`） |

### 2.3 break-glass 緊急登入（路徑 B）

AD 不可用時，本地受保護帳號（預設 `admin`）。須先執行 `add_ad_auth_user_fields.py` 遷移並設定 `INITIAL_ADMIN_PASSWORD`。

```bash
curl -s -X POST "http://localhost:8000/api/auth/login/local" \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": "admin",
    "password": "YOUR_BREAK_GLASS_PASSWORD"
  }' | jq .
```

### 2.4 Email OTP 備援（路徑 D，AD 全斷時）

```bash
# 步驟 1：請求 OTP（AD 須不可達；帳號須曾 AD 登入且有 email）
curl -s -X POST "http://localhost:8000/api/auth/login/admin/email/request" \
  -H "Content-Type: application/json" \
  -d '{"username": "your.ad.account"}' | jq .

# 步驟 2：驗證 OTP
curl -s -X POST "http://localhost:8000/api/auth/login/admin/email/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your.ad.account",
    "otp_code": "123456"
  }' | jq .
```

| HTTP | 情境 |
|------|------|
| 400 | AD 仍正常（應改用路徑 A） |
| 403 | 無 email／未在時間窗內／無 OTP 資格 |
| 429 | 請求過於頻繁 |

### 2.5 變更密碼（break-glass）

```bash
curl -s -X POST "http://localhost:8000/api/auth/password/change" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "OLD_PASSWORD",
    "new_password": "NewSecurePass123!"
  }' | jq .
```

---

## 3. 考試中心與報到

需**受訓者** Token（`is_trainee=true`）。

```bash
# 我的考試列表
curl -s "http://localhost:8000/api/exam/my_exams" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# 查詢報到狀態（plan_id 替換為實際計畫 ID）
curl -s "http://localhost:8000/api/exam/plan/1/attendance/status" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# 報到
curl -s -X POST "http://localhost:8000/api/exam/plan/1/attendance/checkin" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

# 開始考試（未報到應回 403）
curl -s "http://localhost:8000/api/exam/start/1" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

---

## 4. 成績中心報表（T1 系列）

需 `menu:report` 權限。

### 4.1 Overview

```bash
curl -s "http://localhost:8000/api/admin/reports/overview" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

curl -s "http://localhost:8000/api/admin/reports/overview?year=2026&month=1" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

### 4.2 Trends / 部門比較 / 計畫熱門

```bash
curl -s "http://localhost:8000/api/admin/reports/trends?months=6" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

curl -s "http://localhost:8000/api/admin/reports/department-comparison" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

curl -s "http://localhost:8000/api/admin/reports/plan-popularity?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

### 4.3 進行中考試 / 即將到期 / 待重考

```bash
curl -s "http://localhost:8000/api/admin/reports/active-exams" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

curl -s "http://localhost:8000/api/admin/reports/expiring-soon?days=7" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

curl -s "http://localhost:8000/api/admin/reports/retake-needed" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

---

## 5. 教材庫（`/admin/teaching-materials`）

需 `menu:exam`（上傳／下載）；教材類型／格式主檔異動需 `menu:admin`。  
**前置**：`backend/.env` 已設定 `SMB_SERVER`／`SMB_SHARE`；本機已 `pip install smbprotocol`。

### 5.1 主檔查詢

```bash
# 教材類型
curl -s "http://localhost:8000/api/admin/teaching-materials/material-types" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# 允許副檔名
curl -s "http://localhost:8000/api/admin/teaching-materials/material-file-formats" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

### 5.2 NAS 登入（interactive session）

```bash
curl -s -X POST "http://localhost:8000/api/admin/teaching-materials/nas-session/verify" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nas_username": "your.nas.user",
    "nas_password": "YOUR_NAS_PASSWORD"
  }' | jq .
# 回傳 nas_session_token、expires_in（預設約 600 秒）
```

### 5.3 教材列表與衝突預檢

```bash
# 教材庫分頁列表
curl -s "http://localhost:8000/api/admin/teaching-materials/?page=1&page_size=20" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# 同名衝突預檢（plan_id 可省略＝通用教材）
curl -s "http://localhost:8000/api/admin/teaching-materials/conflict-check?original_filename=手冊.pdf&plan_id=1" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

### 5.4 上傳（multipart）

```bash
NAS_TOKEN="上一步的 nas_session_token"

curl -s -X POST "http://localhost:8000/api/admin/teaching-materials/upload" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "nas_session_token=${NAS_TOKEN}" \
  -F "plan_id=1" \
  -F "material_type_id=1" \
  -F "title=測試教材" \
  -F "files=@/path/to/sample.pdf" | jq .
```

同名衝突時加 `-F "conflict_resolution=deactivate_and_new"` 或 `replace_in_place`。

### 5.5 下載

```bash
# 單檔（回傳二進位；可加 -o 存檔）
curl -s -X GET "http://localhost:8000/api/admin/teaching-materials/1/download" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -G --data-urlencode "nas_session_token=${NAS_TOKEN}" \
  -o downloaded.pdf

# 批次 ZIP
curl -s -X POST "http://localhost:8000/api/admin/teaching-materials/batch-download" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"ids\": [1, 2], \"nas_session_token\": \"${NAS_TOKEN}\"}" \
  -o materials.zip
```

---

## 6. 排程備份（`/admin/backup`）

需 `menu:admin:backup` 權限。

```bash
# 讀取排程設定
curl -s "http://localhost:8000/api/admin/backup/config" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# 更新排程（密碼僅在變更時傳入；空字串清除）
curl -s -X PUT "http://localhost:8000/api/admin/backup/config" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "frequency": "daily",
    "time_of_day": "02:00",
    "retention_count": 7,
    "destination": null,
    "backup_nas_username": "backup_svc",
    "backup_nas_password": "YOUR_BACKUP_PASSWORD"
  }' | jq .

# 立即備份
curl -s -X POST "http://localhost:8000/api/admin/backup/run-now" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# 備份紀錄
curl -s "http://localhost:8000/api/admin/backup/records?page=1&size=10" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .
```

---

## 7. QRcode 登入頁（方案 A）

```bash
curl -s -X POST "http://localhost:8000/api/admin/qrcode/login/generate" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# 回傳固定登入頁 URL（非一次性 token）
```

---

## 8. 使用 FastAPI Swagger UI

1. 開啟 `http://localhost:8000/docs`
2. 點「Authorize」→ 輸入 `Bearer <token>`（可含或不含 `Bearer ` 前綴，依 UI 提示）
3. 展開各 tag（`auth`、`teaching-materials`、`backup`、`exam_center`…）測試

---

## 9. 預期回應格式（成績中心節錄）

### Overview

```json
{
  "total_exams": 5,
  "total_records": 120,
  "average_score": 75.5,
  "pass_rate": 85.0,
  "monthly_new_exams": 2,
  "monthly_records": 30,
  "pending_exam_count": 15,
  "avg_exam_duration": 1800,
  "completion_rate": 80.5,
  "retake_rate": 15.0
}
```

### Trends（陣列）

```json
[
  {
    "month": "2025-07",
    "year": 2025,
    "month_num": 7,
    "count": 20,
    "avg_score": 72.5,
    "pass_rate": 80.0
  }
]
```

---

## 10. 常見錯誤

| HTTP | 常見原因 | 處理 |
|------|----------|------|
| 401 | Token 無效／過期／驗證碼錯誤 | 重新登入；檢查 `Authorization: Bearer` |
| 403 | 權限不足；管理角色用免密登入；未報到開考 | 確認 `menu:*` 功能碼；IT 用 `/login/admin` |
| 503 | NAS 未設定；AD 未啟用；SMB 連線失敗 | 查 `backend/.env` 或 Docker `deploy/.env` |
| 401（NAS） | interactive 帳密錯誤；AD 鎖定 `0xc0000234` | 請 IT 解鎖；確認 `SMB_AUTH_DOMAIN` |

### Docker 特別注意

容器**不讀**主機 `backend/.env`；SMB／AD 須設於 `deploy/.env` 的 `TRAINING_*` 並 `force-recreate`。見 [生產部署指南](../../00-專案總覽/生產部署指南.md)。

---

## 11. 參考文件

- [棕地功能總覽](../棕地功能總覽.md) — 模組與程式落點
- [角色與權限管理架構說明](../../00-專案總覽/角色與權限管理架構說明.md)
- [AD 整合技術設計](../plans/20260612_AD整合_系統管理者登入_技術設計.md)
- [NAS與路徑跨平台慣例](../../00-專案總覽/NAS與路徑跨平台慣例.md)
- 自動化測試：`tests/test_new_apis.py`、`tests/test_email_otp.py`
