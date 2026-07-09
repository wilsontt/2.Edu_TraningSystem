# 已通過授權重考、考試中心及格分修正與訓練計畫 Modal 雙欄 — 實作計劃 (PLAN)

**文件類型**：棕地實作計劃  
**建立日期**：2026-07-09  
**狀態**：實作中（Phase 4 已完成；Phase 1～3 已併入本分支）  
**關聯議題**：已通過但成績不理想之重考需求、ExamDashboard 及格判斷錯誤、訓練計畫編輯 Modal 過長

> 本文件僅依已確認結論撰寫，不新增額外需求。  
> **2026-07-09 更新**：Phase 4（Modal 雙欄）已完成，無需再做。重考機制（Phase 1～3）自 `feature/authorized-retake-exam-fix-plan-modal` cherry-pick 至本分支。

---

## 1. 目的

1. 建立「**已通過仍可經授權重考**」機制，讓具權限角色可開放重考。
2. 修正考試中心前端硬編碼 `60` 的及格判斷，改為依各訓練計畫 `passing_score`。
3. 明確定義重考歷程記錄方式，確保每次重考皆可追溯。
4. 將訓練計畫編輯畫面改為左右雙欄，降低 Modal 過長造成的操作負擔。

---

## 2. 範圍

### 2.1 涵蓋（In Scope）

| 項目 | 範圍 |
|---|---|
| 重考授權 | 新增已通過授權重考資料結構、權限、API、開考與交卷整合 |
| 考試中心 | `ExamDashboard` 移除硬編碼 60，改用後端回傳狀態 |
| 重考紀錄 | 維持 `exam_history` 每次提交一筆；新增授權紀錄表追蹤授權行為 |
| 前端管理入口 | 成績中心加入「開放重考」操作（具權限者可用） |
| 編輯畫面 | `TrainingPlanManager` 編輯 Modal 改為左表單、右教材雙欄 |

### 2.2 不涵蓋（Out of Scope）

| 項目 | 說明 |
|---|---|
| 變更「未通過可重考」既有規則 | 維持原行為，不改為需授權 |
| 大規模改版成績中心資訊架構 | 僅新增必要操作與欄位顯示 |
| 新增複雜批次授權流程 | 本次先做單筆授權 |

### 2.3 業務規則（已確認）

| # | 規則 |
|---|---|
| R1 | 未通過者維持可重考（既有機制） |
| R2 | 已通過者預設不可重考；需具權限者授權 |
| R3 | 一次授權只對應一次重考機會（交卷後自動消耗） |
| R4 | 及格判斷不得硬編碼，必須依計畫 `passing_score` |
| R5 | 每次提交都必須有歷程紀錄可追蹤 |

---

## 3. 權責

| 角色 | 責任 |
|---|---|
| 開發 | 依本 PLAN 完成後後端、前端、DB migration 與文件同步 |
| 審核者（Wilson） | 確認授權角色範圍與一次授權一次重考規則 |
| 維運/部署 | 執行 migration、驗證權限碼入庫、確認既有資料可相容 |

---

## 4. 名詞解釋

| 名詞 | 說明 |
|---|---|
| 已通過授權重考 | 使用者原本 `is_passed = true`，由具權限者手動開放一次重考 |
| `retake_authorized` | `exam_records` 快取欄位，表示目前是否有待使用授權 |
| `exam_retake_authorizations` | 記錄授權行為（誰授權、原因、何時授權、是否已消耗/撤銷） |
| `exam_history` | 每次提交快照；用於重考次數與歷程詳情追溯 |
| `can_start_exam` | 後端回傳給前端的可開考旗標，作為唯一顯示依據 |

---

## 5. 作業內容

### 5.1 後端資料模型與 migration

#### 5.1.1 新增授權紀錄表

新增 `exam_retake_authorizations`，欄位：

- `id`（PK）
- `record_id`（FK -> `exam_records.id`）
- `authorized_by`（授權者 emp_id）
- `authorized_at`
- `reason`（必填）
- `consumed_at`（授權重考交卷後填入）
- `revoked_at`、`revoked_by`（撤銷時填入）

#### 5.1.2 擴充 `exam_records`

新增欄位：

- `retake_authorized BOOLEAN DEFAULT 0`

#### 5.1.3 ORM 更新

更新 `backend/app/models.py`：

- `ExamRecord` 新增 `retake_authorized`
- 新增 `ExamRetakeAuthorization` model 與 relationship

---

### 5.2 權限設計（2.2）

#### 5.2.1 新增功能碼

新增 `SystemFunction`：

- `code`: `btn:exam:authorize-retake`
- `name`: 開放重考
- `parent`: `menu:report`

（若本批納入撤銷）可新增：

- `btn:exam:revoke-retake`

#### 5.2.2 授權角色

以角色功能碼為主，不硬編碼角色名稱；Admin 保留 bypass。  
可被指派此功能的角色範圍：稽核、主管、總稽核、管理者（依既有 RBAC 配置）。

#### 5.2.3 存取邊界

除功能權限外，沿用現有資料範圍機制檢查（`_can_view_emp_id` / `access_scope`）：

- 全域可見者可授權全域
- 部門可見者僅可授權所屬範圍

---

### 5.3 API 設計（2.3）

#### 5.3.1 開放重考

- `POST /api/exam/admin/authorize-retake`
- Body: `emp_id`, `plan_id`, `reason`

驗證：

1. 呼叫者具 `btn:exam:authorize-retake`
2. 目標員工在資料範圍內
3. 計畫存在且未封存
4. `exam_record` 存在且 `is_passed = true`
5. `retake_authorized = false`
6. `reason` 非空

寫入：

- `exam_records.retake_authorized = true`
- 新增一筆 `exam_retake_authorizations`

#### 5.3.2 撤銷重考（可選，同批實作時納入）

- `POST /api/exam/admin/revoke-retake`
- Body: `emp_id`, `plan_id`

限制：僅可撤銷未消耗授權。

#### 5.3.3 回傳欄位擴充（考試中心）

擴充 `GET /api/exam/my_exams` 每筆資料：

- `passing_score`
- `is_passed`
- `retake_authorized`
- `can_start_exam`

---

### 5.4 開考與交卷邏輯調整（2.4）

#### 5.4.1 `start_exam`

現況：`is_passed` 直接拒絕。  
調整為：

- `is_passed = true && retake_authorized = false` -> 拒絕開考
- `is_passed = true && retake_authorized = true` -> 允許開考
- `is_passed = false` -> 維持既有可重考邏輯

#### 5.4.2 `submit_exam`

維持既有：

- 更新 `exam_records`
- `attempts + 1`
- 每次提交新增 `exam_history`

新增：

- 若此次為授權重考，提交後將 `retake_authorized` 清回 `false`
- 對應授權紀錄補 `consumed_at`

---

### 5.5 重考次數與歷程記錄策略

| 資料 | 用途 |
|---|---|
| `exam_history` | 每次提交一筆（包含分數、通過與詳細作答快照） |
| `exam_records.attempts` | 最新累積提交次數 |
| `exam_retake_authorizations` | 管理端授權行為稽核 |

結論：

- 「重考歷程」以 `exam_history` 為主來源
- 「授權軌跡」以 `exam_retake_authorizations` 為主來源

---

### 5.6 前端 — 授權重考 UI（Phase 3）

#### 5.6.1 成績中心操作入口

至少在下列頁面提供授權入口（具權限才顯示）：

- `PersonalScoreHistory.tsx`
- `ReportDashboard.tsx`（部門明細列表）

按鈕顯示條件：

- `is_passed = true`
- `retake_authorized = false`
- 使用者具 `btn:exam:authorize-retake`

交互流程：

1. 點「開放重考」
2. 填寫 `reason`（必填）
3. 呼叫 `authorize-retake`
4. 成功後刷新資料並顯示狀態「已開放重考」

#### 5.6.2 ExamDashboard 修正

移除所有 `score >= 60` / `score < 60` 判斷，改由 API 回傳：

- `is_passed`（顯示通過/未通過）
- `can_start_exam`（控制「開始考試」按鈕）

> 前端不再自行推論及格與可開考條件。

---

### 5.7 訓練計畫編輯 Modal 左右雙欄（Phase 4）

#### 5.7.1 目標

`TrainingPlanManager.tsx` 編輯模式改為：

- 左欄：訓練計畫表單欄位
- 右欄：`PlanMaterialsSection`（教材上傳與列表）

#### 5.7.2 版面規則

| 情境 | 版面 |
|---|---|
| 編輯模式（桌面） | 左右雙欄 |
| 編輯模式（窄螢幕） | 上下堆疊 |
| 新增模式 | 維持單欄（不顯示教材區） |

#### 5.7.3 要求

- Modal 寬度放大至可承載雙欄
- 左右欄位需各自可捲動，底部操作按鈕固定
- 不調整教材功能本身規則（只做布局調整）

---

## 6. 參考文件

- `backend/app/routers/exam_center.py`
- `backend/app/models.py`
- `backend/app/access_scope.py`
- `backend/app/routers/auth.py`
- `backend/app/init_db.py`
- `frontend/src/components/exam/ExamDashboard.tsx`
- `frontend/src/components/personal/PersonalScoreHistory.tsx`
- `frontend/src/components/admin/ReportDashboard.tsx`
- `frontend/src/components/admin/TrainingPlanManager.tsx`
- `frontend/src/components/teaching/PlanMaterialsSection.tsx`
- `1.docs/00-專案總覽/角色與權限管理架構說明.md`
- `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md`

---

## 7. 使用表單（欄位說明）

### 7.1 開放重考請求表單（前端 Modal）

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `emp_id` | string | 是 | 目標員工編號 |
| `plan_id` | number | 是 | 訓練計畫 ID |
| `reason` | string | 是 | 開放重考原因（供稽核） |

### 7.2 開放重考 API 請求

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `emp_id` | string | 是 | 目標員工編號 |
| `plan_id` | integer | 是 | 計畫 ID |
| `reason` | string | 是 | 授權原因，空字串視為無效 |

### 7.3 `my_exams` 回傳擴充欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `passing_score` | integer | 該計畫及格分數 |
| `is_passed` | boolean/null | 最近一次提交是否通過 |
| `retake_authorized` | boolean | 是否已有待使用重考授權 |
| `can_start_exam` | boolean | 是否可點擊開始考試 |

---

## 8. 驗收清單（依已確認結論）

| # | 情境 | 預期 |
|---|---|---|
| T1 | 計畫及格分 80，成績 75 | 前端顯示未通過，可重考 |
| T2 | 計畫及格分 80，成績 85 | 前端顯示已通過，不可直接重考 |
| T3 | 已通過者經授權 | 前端顯示可開始考試 |
| T4 | 授權重考交卷後 | 授權被消耗、不可再次重考（除非再授權） |
| T5 | 同一人多次重考 | `exam_history` 筆數累加，歷程可查 |
| T6 | 無權限者呼叫授權 API | 403 |
| T7 | 編輯訓練計畫（桌面） | Modal 左右雙欄，教材在右 |
| T8 | 編輯訓練計畫（手機） | 上下堆疊可操作 |

---

**請審核者確認**：本 PLAN 僅包含既定結論，確認後再進入實作。
