# T13 增修功能實作 PLAN（成績中心／考卷工坊／報到總覽／考試中心）

## 1. 目的
- 將 `T13_成績中心_考卷_報到總覽_增修功能需求.md` 轉為可落地執行的實作計畫。
- 先完成需求對應、權限範圍、API/前端改動、測試與文件同步規劃，再進入程式碼實作。
- 作為後續「可行性討論」與「實作排程決策」的共同基準文件。

## 2. 範圍
### 2.1 In Scope
- 成績中心
  - 依職務/角色做資料可視範圍（部門內 / 全部）。
  - 在「各部門統計 / 計畫統計」新增「成績列印」頁籤。
  - 支援多人勾選列印，列印前選項：
    - 是否列印員工簽名（預設否）
    - 是否列印考試歷程（預設否）
- 考卷工坊
  - 訓練計畫題目清單支援「全選 / 不全選」與批次刪除。
  - 題庫維護支援「全選 / 不全選」與批次刪除。
- 報到總覽
  - 僅允許有權限角色存取。
  - 登入後僅顯示「正在進行中」訓練計畫。
  - 同時顯示多訓練計畫報到狀況。
  - 報到統計 Modal 新增「請假」統計卡與列印功能。
  - 統計卡片點擊後切換為單一清單（預設「應到」）。
- 考試中心
  - 未報到按「開始考試」時，提示 Modal 加入「立即報到」按鈕。

### 2.2 Out of Scope
- 大幅重構現有報表架構（僅做增修）。
- 重做整體 RBAC (Role-Based Access Control，基於角色的存取控制) 架構（僅補齊本次需求所需規則）。
- 非 T13 需求之 UI 視覺重設。

## 3. 權責
### 3.1 角色權限矩陣（待最終確認）
- 僅能看/列印自己部門：`主管`、`稽核`
- 可看/列印全部：`總稽核`、`業務`、`系統管理`、`ADMIN`

### 3.2 模組責任
- `backend/app/routers/report.py`
  - 成績中心資料查詢範圍控制。
  - 成績列印 preview/pdf API。
- `backend/app/routers/training.py`
  - 報到總覽統計欄位擴充（含請假統計）。
  - 報到總覽列印 API（若與 report 共用可抽 service）。
- `backend/app/routers/admin.py`（或現有 exam router）
  - 題目批次刪除 API。
- `frontend/src/components/admin/ReportDashboard.tsx`
  - 新增「成績列印」頁籤與多人勾選列印互動。
- `frontend/src/components/attendance/AttendanceOverviewPage.tsx`
  - 只顯示 active 計畫。
  - 統計卡片 + 單一清單篩選 + 列印操作。
- `frontend/src/components/admin/ExamStudio.tsx`、`QuestionBankManager`
  - 全選/不全選 + 批次刪除 UI。
- `frontend/src/components/exam/ExamDashboard.tsx`
  - 未報到開始考試提示 Modal + 立即報到。

## 4. 名詞解釋
- 成績列印：依查詢條件勾選多位人員，輸出 PDF 成績單。
- 列印員工簽名：PDF 中附員工簽名欄位（是否顯示）。
- 列印考試歷程：PDF 中附該員工該計畫（或範圍）歷次紀錄（是否顯示）。
- 報到統計卡片：應到/實到/未到/請假四種統計入口。
- 單一清單模式：報到統計 Modal 僅保留一個列表，內容由所選卡片決定。

## 5. 作業內容
### 5.1 Phase 0：需求與規則凍結（必要前置）
- 確認角色名稱與 DB 實際值對應（尤其「主管」「稽核」「總稽核」）。
- 確認「請假」判定規則：
  - `absence_reason_code` 有值即列為請假。
  - 無值且未報到列為未到。
- 確認列印輸出欄位最小集：
  - 員工編號、姓名、部門、計畫、分數、是否通過、日期
  - 選配：簽名欄、歷程表

### 5.2 Phase 1：後端 API 與資料範圍控制
- 成績中心資料範圍過濾
  - 新增共用函式：依 current_user 決定可見部門集合。
  - 套用於 `/admin/reports/*` 查詢與匯出。
- 成績列印 API
  - `POST /admin/reports/print/preview`
  - `POST /admin/reports/print/pdf`
  - 參數含：多人選取與兩個列印布林選項。
- 報到總覽統計擴充
  - `GET /training/plans/{plan_id}/attendance/stats` 增加：
    - `leave_count`
    - `absent_without_reason_count`
    - 可供前端單清單切換的統計欄位
- 報到總覽列印 API（若獨立）
  - `POST /training/plans/{plan_id}/attendance/print/pdf`
  - 套用同一套權限邏輯（部門/全域）
- 題目批次刪除 API
  - `DELETE /admin/exams/questions/bulk`
  - Request body：`question_ids: number[]`
  - Response：刪除成功數/失敗清單

### 5.3 Phase 2：前端功能增修
- 成績中心 `ReportDashboard`
  - 新增第三頁籤：`成績列印`
  - 清單多選、全選、清除選取、列印前選項 Dialog
  - 呼叫 preview -> 確認 -> 下載 pdf
- 報到總覽 `AttendanceOverviewPage`
  - 固定查詢 `status=active`
  - Modal 上方統計卡：應到/實到/未到/請假
  - 下方單一列表依卡片切換（預設應到）
  - 新增列印按鈕，依權限控制可列印範圍
- 考卷工坊 `ExamStudio` + 題庫維護
  - 題目列 checkbox
  - 全選/不全選
  - 批次刪除按鈕 + 二次確認
- 考試中心 `ExamDashboard`
  - 點「開始考試」前先檢查報到狀態
  - 未報到顯示 Modal，含「立即報到」
  - 報到成功後導向 `/exam/run/{plan_id}`

### 5.4 Phase 3：測試與驗收
- 後端測試（建議新增最小單元測試）
  - 權限範圍測試（主管/稽核 vs 全域角色）
  - 批次刪除 API 邏輯測試
  - 報到統計請假分類測試
- 前端驗證
  - 成績列印多人選取與兩個列印選項
  - 報到統計卡片切換單列表
  - 未報到「立即報到」流程
- 端到端 UAT 清單
  - 以 2 種角色（部門限制 / 全域）各跑一次完整流程

### 5.5 里程碑與交付
- M1（1~2 天）：Phase 0 + Phase 1
- M2（1~2 天）：Phase 2
- M3（0.5~1 天）：Phase 3 + 文件同步 + UAT 修正
- 交付物：
  - 程式碼 PR
  - 測試證據（API + UI）
  - 文件更新

### 5.6 風險與因應
- 風險 1：角色名稱與職務名稱在資料庫不一致  
  - 因應：先做 role/job title 對照表，實作前鎖定 mapping。
- 風險 2：歷程列印資料不足（舊資料無完整歷次）  
  - 因應：先以現有可取得資料列印；若需完整歷次另開後續任務。
- 風險 3：大量列印效能  
  - 因應：先限制單次筆數並提供 preview；必要時加背景任務。

## 6. 參考文件
- `0.standards/2.棕地專案/T13_成績中心_考卷_報到總覽_增修功能需求.md`
- `frontend/src/components/admin/ReportDashboard.tsx`
- `frontend/src/components/attendance/AttendanceOverviewPage.tsx`
- `frontend/src/components/admin/ExamStudio.tsx`
- `frontend/src/components/exam/ExamDashboard.tsx`
- `backend/app/routers/report.py`
- `backend/app/routers/training.py`
- `backend/app/routers/admin.py`
- `backend/app/routers/auth.py`

## 7. 使用表單（欄位說明）
### 7.1 成績列印請求表單（前端 -> 後端）
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| scope | string | Y | 列印範圍：`department` / `plan` |
| dept_ids | number[] | N | 部門篩選（由 scope 決定） |
| plan_ids | number[] | N | 計畫篩選（由 scope 決定） |
| emp_ids | string[] | Y | 勾選列印的人員清單 |
| include_employee_signature | boolean | Y | 是否列印員工簽名，預設 `false` |
| include_exam_history | boolean | Y | 是否列印考試歷程，預設 `false` |

### 7.2 題目批次刪除表單
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| question_ids | number[] | Y | 要刪除的題目 ID 清單 |

### 7.3 報到統計卡片篩選狀態（前端本地狀態）
| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| selected_attendance_filter | string | Y | `expected` / `actual` / `absent` / `leave` |
| default_value | string | Y | 預設 `expected` |
