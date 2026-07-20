# 報到 QR／開課單位 Owner／教材庫 UX

**日期**：2026-07-17～18  
**狀態**：✅ 已實作（分支 `feature/checkin-owner-scope-20260717`）；人工瀏覽器驗收待勾選  
**PLAN**：[../plans/20260717_報到-訓練計畫-教材-題庫_新增需求_PLAN.md](../plans/20260717_報到-訓練計畫-教材-題庫_新增需求_PLAN.md)  
**TASKS**：[../tasks/20260717_報到-訓練計畫-教材-題庫_新增需求_TASKS.md](../tasks/20260717_報到-訓練計畫-教材-題庫_新增需求_TASKS.md)

---

## 1. 目的

1. 上課前／考試時共用報到 QR；登入後必回報到頁並自動報到；成功頁顯示訓練名稱。  
2. 開課單位 Owner：**編輯／刪除／封存**（計畫另含產生報到 QR；**考卷工坊考題**依計畫 `dept_id`）僅開課單位或超管；其餘僅檢視／下載。  
3. 教材庫編輯鎖、檔案檢視可刪；報到總覽統計 Modal 內嵌 QR 並縮卡片放大 QR。  
4. `attendance_records` 補 UNIQUE，避免同一人兩列。

---

## 2. 行為定案

| 項目 | 定案 |
|------|------|
| 報到資料 | 單一 `attendance_records`；`UNIQUE(emp_id, plan_id)`；checkin 冪等 |
| QR 入口 | 訓練計畫操作欄＋報到總覽「顯示 QRcode」；非系統管理登入 QR |
| returnTo | 僅 `/checkin…`；`LoginReturnRedirect` 防止登入後被導回首頁 |
| 計畫名稱 | `attendance/status` 與 `checkin` 回傳 `plan_title` |
| Owner | `dept_id`；超管例外；NULL 不限制；**寫入**含編輯／刪除／封存（計畫含產生 QR） |
| 教材刪除 | 軟刪（`is_active`）；無 NAS 救回產品流程 |

---

## 3. 落點

| 層 | 路徑 |
|----|------|
| 遷移 | `backend/migrations/add_owner_dept_fields.py`、`add_attendance_emp_plan_unique.py` |
| 後端 | `access_scope.py`、`models.py`、`schemas.py`、`exam_center.py`、`training.py`、`exam.py`、`question_bank.py`、`teaching_material_sets.py`、`auth.py`（`/me` 的 `dept_id`） |
| 前端 | `App.tsx`、`LoginPage.tsx`、`CheckInPage.tsx`、`AttendanceOverviewPage.tsx`、`TrainingPlanManager.tsx`、`QuestionBankManager.tsx`、`TeachingMaterialLibrary.tsx`、教材 Upload／Edit／Plan 區、`authGuards.ts` |
| 測試 | `tests/test_owner_scope.py`、`tests/test_attendance_checkin_idempotent.py` |

---

## 4. 部署注意

```bash
cp data/education_training.db data/education_training.db.bak-$(date +%Y%m%d)
cd backend
.venv/bin/python3 migrations/add_owner_dept_fields.py
.venv/bin/python3 migrations/add_attendance_emp_plan_unique.py
```

**ds1 Docker（必跑，否則歷史題庫 HTTP 500）**：

```bash
cd /opt/apps/enterprise-portal/deploy
cp -a "${DATA_ROOT:-/opt/apps/enterprise-portal/data}/training/education_training.db" \
      "${DATA_ROOT:-/opt/apps/enterprise-portal/data}/training/education_training.db.bak.$(date +%Y%m%d_%H%M%S)"
docker compose exec training-backend python migrations/add_owner_dept_fields.py
docker compose exec training-backend python migrations/add_attendance_emp_plan_unique.py
```

詳見 [MIGRATION_GUIDE](../../00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md)「開課單位擁有權」症狀表、[生產部署指南](../../00-專案總覽/生產部署指南.md) §5.7。

---

## 5. 驗收

- [x] pytest（Owner、checkin 冪等、教材套組 dept_id）  
- [x] lint／build（既有無關項除外）  
- [ ] 未登入掃碼 → 自動報到＋計畫名稱  
- [ ] 統計無重複列；Modal QR 版面  
- [ ] Owner／超管：**編輯／刪除／封存**行為（非 Owner 403／檢視模式）  
- [ ] 教材編輯鎖與檔案刪除  
