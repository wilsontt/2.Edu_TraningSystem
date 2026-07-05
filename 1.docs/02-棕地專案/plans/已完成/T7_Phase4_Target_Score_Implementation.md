# 實作計畫：受課對象與及格分數設定 (Phase 4)

## 目標
1.  **受課對象 (Target Audience)**：允許訓練計畫指定多個部門作為參加對象（多選），預設為與開課單位相同。
2.  **及格分數 (Passing Score)**：新增設定欄位，預設為 60 分。

## 實作內容

### 1. 資料庫模型 (`backend/app/models.py`)
-   **新增關聯表**：`plan_target_departments` (Many-to-Many)
    -   `plan_id` (FK), `dept_id` (FK)
-   **修改 `TrainingPlan`**：
    -   新增 `passing_score` (Integer, default=60)。
    -   新增 `target_departments` (relationship to Department via secondary table)。

### 2. 後端 API (`training.py`, `exam_center.py`, `schemas.py`)
-   **Schema 更新**：`TrainingPlanBase` 新增 `passing_score`；`TrainingPlanCreate` 新增 `target_dept_ids`。
-   **CRUD 邏輯**：
    -   `create`/`update` training plan 時處理 `passing_score` 與 `target_departments`。
-   **考試中心邏輯**：
    -   `get_my_exams`: 篩選 `plan.target_departments` 包含目前使用者的部門。
    -   `submit_exam`: 使用 `plan.passing_score` 作為及格判斷標準。

### 3. 前端介面 (`frontend/src/components/admin/TrainingPlanManager.tsx`)
-   新增「及格分數」輸入框 (預設 60)。
-   新增「受課對象」多選清單與「同開課單位」快速按鈕。

## 狀態
- [x] 已完成 (Phase 4 Completed)
