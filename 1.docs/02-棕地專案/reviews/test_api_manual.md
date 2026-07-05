# API 測試手冊

## 後端服務已啟動
服務運行於：`http://localhost:8000`

## 測試步驟

### 1. 取得認證 Token

首先需要登入取得 JWT Token：

```bash
# 1. 取得驗證碼
curl -X GET "http://localhost:8000/api/auth/captcha"

# 2. 使用驗證碼登入（替換 YOUR_EMP_ID 和 CAPTCHA_ANSWER）
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "emp_id": "YOUR_EMP_ID",
    "captcha_id": "CAPTCHA_ID",
    "answer": "CAPTCHA_ANSWER"
  }'

# 從回應中取得 access_token
```

### 2. 測試新建立的 API 端點

將 `YOUR_TOKEN` 替換為實際的 access_token：

#### T1.1: 擴充的 Overview API

```bash
# 基本查詢（所有資料）
curl -X GET "http://localhost:8000/api/admin/reports/overview" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 帶時間篩選（2026年1月）
curl -X GET "http://localhost:8000/api/admin/reports/overview?year=2026&month=1" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 帶年度篩選（2026年）
curl -X GET "http://localhost:8000/api/admin/reports/overview?year=2026" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 帶季度篩選（2026年第1季）
curl -X GET "http://localhost:8000/api/admin/reports/overview?year=2026&quarter=1" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### T1.2.1: Trends API

```bash
# 查詢過去 6 個月的趨勢
curl -X GET "http://localhost:8000/api/admin/reports/trends?months=6" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 查詢過去 12 個月的趨勢
curl -X GET "http://localhost:8000/api/admin/reports/trends?months=12" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### T1.2.2: Department Comparison API

```bash
curl -X GET "http://localhost:8000/api/admin/reports/department-comparison" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### T1.2.3: Plan Popularity API

```bash
# 查詢前 10 名計畫
curl -X GET "http://localhost:8000/api/admin/reports/plan-popularity?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 查詢前 5 名計畫
curl -X GET "http://localhost:8000/api/admin/reports/plan-popularity?limit=5" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### T1.3.1: Active Exams API

```bash
curl -X GET "http://localhost:8000/api/admin/reports/active-exams" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### T1.3.2: Expiring Soon API

```bash
# 查詢 3 天內到期的考試（預設）
curl -X GET "http://localhost:8000/api/admin/reports/expiring-soon?days=3" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# 查詢 7 天內到期的考試
curl -X GET "http://localhost:8000/api/admin/reports/expiring-soon?days=7" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### T1.3.3: Retake Needed API

```bash
curl -X GET "http://localhost:8000/api/admin/reports/retake-needed" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## 使用 FastAPI 自動文檔測試

1. 開啟瀏覽器訪問：`http://localhost:8000/docs`
2. 點擊右上角「Authorize」按鈕
3. 輸入：`Bearer YOUR_TOKEN`（不需要輸入 "Bearer "，只輸入 token）
4. 點擊各個 API 端點進行測試

## 預期回應格式

### Overview API 回應範例

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

### Trends API 回應範例

```json
[
  {
    "month": "2025-07",
    "year": 2025,
    "month_num": 7,
    "count": 20,
    "avg_score": 72.5,
    "pass_rate": 80.0
  },
  ...
]
```

### Department Comparison API 回應範例

```json
[
  {
    "department_id": 1,
    "department_name": "資訊部",
    "avg_score": 85.5,
    "pass_rate": 90.0,
    "completion_rate": 85.0,
    "count": 30
  },
  ...
]
```

### Plan Popularity API 回應範例

```json
{
  "popularity_ranking": [
    {
      "plan_id": 1,
      "plan_title": "資訊安全教育訓練",
      "count": 50,
      "avg_score": 80.0
    },
    ...
  ],
  "score_ranking": [
    {
      "plan_id": 2,
      "plan_title": "新進員工訓練",
      "count": 30,
      "avg_score": 90.0
    },
    ...
  ]
}
```

### Active Exams API 回應範例

```json
{
  "count": 3,
  "exams": [
    {
      "plan_id": 1,
      "title": "資訊安全教育訓練",
      "training_date": "2026-01-01",
      "end_date": "2026-01-31",
      "target_count": 50,
      "completed_count": 30,
      "remaining_days": 24
    },
    ...
  ]
}
```

### Expiring Soon API 回應範例

```json
{
  "count": 2,
  "exams": [
    {
      "plan_id": 1,
      "title": "資訊安全教育訓練",
      "end_date": "2026-01-10",
      "remaining_days": 3,
      "target_count": 50,
      "completed_count": 30,
      "pending_count": 20
    },
    ...
  ]
}
```

### Retake Needed API 回應範例

```json
{
  "count": 5,
  "users": [
    {
      "emp_id": "E001",
      "name": "張三",
      "dept_name": "資訊部",
      "plans": [
        {
          "plan_id": 1,
          "plan_title": "資訊安全教育訓練",
          "score": 55,
          "passing_score": 60,
          "submit_time": "2026-01-05T10:30:00",
          "attempts": 1
        },
        ...
      ]
    },
    ...
  ]
}
```

## 常見錯誤

### 401 Unauthorized
- 檢查 Token 是否正確
- 檢查 Token 是否過期（預設 8 小時）
- 確認 Authorization header 格式：`Bearer YOUR_TOKEN`

### 403 Forbidden
- 確認使用者角色有 `menu:report` 權限
- 確認使用者為 Admin 角色

### 500 Internal Server Error
- 檢查資料庫連線
- 檢查後端日誌錯誤訊息
