---
name: T13 增修實作計劃
overview: 依 T13 測試問題與新增需求，分後端權限規則、查詢範圍、列印流程、清單互動與前端 UI 五大面向進行全量實作。採用 Hybrid 可視範圍規則：角色優先、職務補充、預設 self。
todos:
  - id: t13-1
    content: 建立並套用 Hybrid 可視範圍 resolver（role > job_title > self）至報到/成績/列印查詢
    status: in_progress
  - id: t13-2
    content: 完成成績中心列印問答流程與成績列印頁籤（清單/個人成績、多計畫選擇）
    status: pending
  - id: t13-3
    content: 補齊列印清單能力：序號、分頁、排序、關鍵字查詢、標題與4卡統計
    status: in_progress
  - id: t13-4
    content: 修正報到總覽：批次未報到原因、選中卡片可視化、即時重算統計
    status: in_progress
  - id: t13-5
    content: 確保報到總覽與訓練計畫報到統計口徑一致並完成差異修正
    status: in_progress
  - id: t13-6
    content: 完成考卷工坊增強：上傳區左右版型、搜尋清除X、全選/不全選、多標籤編輯
    status: pending
  - id: t13-7
    content: 完成考試中心與訓練計畫補強：僅進行中且本人可見、隱藏未啟用人員
    status: pending
  - id: t13-8
    content: 執行角色情境與列印流程的回歸測試並整理驗收結果
    status: pending
isProject: false
---

## 執行與驗收 Checklist

> 規則：只有「你測試確認無誤」後，該項目才可從進行中改為完成。

- [ ] T13-1 建立並套用 Hybrid 可視範圍 resolver（role > job_title > self）至報到/成績/列印查詢（目前：進行中）
- [ ] T13-2 完成成績中心列印問答流程與成績列印頁籤（清單/個人成績、多計畫選擇）（目前：待處理）
- [ ] T13-3 補齊列印清單能力：序號、分頁、排序、關鍵字查詢、標題與4卡統計（目前：進行中）
- [ ] T13-4 修正報到總覽：批次未報到原因、選中卡片可視化、即時重算統計（目前：進行中）
- [ ] T13-5 確保報到總覽與訓練計畫報到統計口徑一致並完成差異修正（目前：進行中）
- [ ] T13-6 完成考卷工坊增強：上傳區左右版型、搜尋清除X、全選/不全選、多標籤編輯（目前：待處理）
- [ ] T13-7 完成考試中心與訓練計畫補強：僅進行中且本人可見、隱藏未啟用人員（目前：待處理）
- [ ] T13-8 執行角色情境與列印流程的回歸測試並整理驗收結果（目前：待處理）

# T13 增修功能實作 PLAN（測試問題＋新增需求）

## 目標與範圍

完成 `0.standards/2.棕地專案/T13 增修功能實作PLAN_測試問題.md` 的全部項目，涵蓋：

- 成績中心（可視範圍、列印問答、列印清單能力）
- 考卷工坊（上傳區版型、題庫搜尋清除、匯入全選/不全選、題目標籤編輯）
- 報到總覽（可視範圍一致性、請假原因批次編輯、即時統計）
- 考試中心（僅顯示本人且進行中計畫）
- 訓練計畫（隱藏未啟用人員）

## 核心規則（Hybrid 可視範圍）

- 規則優先序：`role -> job_title -> default`
- 角色優先：
  - `Admin/System Admin` => `all`
  - 部門管理角色 => `department`
  - 一般使用者 => `self`
- 職務補充：主管/副理/經理等 => `department`，其餘 => `self`
- 預設：`self`（最小權限）
- 實作方式：在後端集中封裝可視範圍解析函式與查詢過濾器，避免各 router 重複寫判斷。

## 實作分解

### 1) 權限與查詢基礎層（後端）

- 在 `backend/app/routers/auth.py` 既有 `current_user` 基礎上，新增共用 scope resolver（可放 `utils` 或 `routers` 共用模組）。
- 在報到、成績、列印、訓練計畫相關查詢套用 scope filter：
  - `all`：不限制
  - `department`：限制 `dept_id == current_user.dept_id`
  - `self`：限制 `emp_id == current_user.emp_id`
- 先補上單元邏輯測試（至少 resolver 的輸入/輸出組合）。

### 2) 成績中心（報表/列印）

- 後端：
  - 釐清「列印 PDF 按鈕數字」來源，改為可追蹤計算（以目前篩選結果數量為準）。
  - 列印資料結構新增：ITEM 序號、可分頁、可排序、可關鍵字（部門/員編/姓名）查詢。
  - 報表標題改為「XXX 教育訓練報到清單」，標題下方帶入 4 卡統計值。
- 前端（`frontend/src/components/admin/ReportDashboard.tsx` 及列印相關元件）：
  - 新增「列印前問答」：是否列印簽名欄（預設否）、是否列印考試歷程（預設否）。
  - 新增「成績列印」頁籤問答：
    - 列印成績清單 or 每人考卷成績
    - 選擇單一或多個訓練計畫
  - 清單區補齊：序號欄、每頁筆數、分頁、排序、關鍵字查詢。
  - 列印內容不顯示「簽名欄:否 / 歷程:否」這種詢問字樣本身。

### 3) 報到總覽一致性

- 依 Hybrid 規則限制可見計畫與可見名單，確保「查看」與「列印目前清單」一致。
- 報到統計 Modal：
  - 增加批次填寫未報到原因（一次套用多人）
  - 明確標示目前選中的統計卡
  - 編輯原因後即時重算 4 卡統計
- 對齊「報到總覽」與「訓練計畫報到統計」統計口徑，避免同計畫數字不一致。

### 4) 考卷工坊

- `frontend/src/components/admin/ExamStudio.tsx`：上傳區改為左右雙欄（左：圖示/拖放文案，右：選檔與說明）。
- 題庫維護與匯入模態：
  - 關鍵字/標籤 input 加「清除 X」按鈕
  - 匯入題目新增「全選 / 不全選」
  - 題目編輯支援多標籤輸入（保持與 `question_bank` API 結構一致）
- 必要時更新 `backend/app/routers/question_bank.py` 的 tags 解析與驗證。

### 5) 考試中心與訓練計畫補強

- 考試中心僅顯示「本人 + 進行中 + 非封存 + 非過期」訓練計畫（前後端雙保險）。
- 訓練計畫編輯的個人受課對象清單，全面過濾停用帳號（`status != active` 不顯示）。

## 驗收與回歸測試

- 身分情境：Admin / 部門主管 / 一般 User 各跑一輪。
- 報到與成績：同一訓練計畫在不同入口統計值一致。
- 列印：
  - 問答預設值正確
  - 清單模式與個人成績模式可切換
  - 多計畫選擇與分頁/排序/搜尋正常
- 考卷工坊：上傳區版型、清除 X、全選/不全選、多標籤皆可用。
- 考試中心：過期/封存不顯示；本人可見資料正確。

## 主要影響檔案（預估）

- 後端：
  - [/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/backend/app/routers/exam.py](/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/backend/app/routers/exam.py)
  - [/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/backend/app/routers/question_bank.py](/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/backend/app/routers/question_bank.py)
  - [/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/backend/app/routers/auth.py](/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/backend/app/routers/auth.py)
- 前端：
  - [/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/frontend/src/components/admin/ReportDashboard.tsx](/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/frontend/src/components/admin/ReportDashboard.tsx)
  - [/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/frontend/src/components/admin/ExamStudio.tsx](/Users/wilson/5.Projects/3.企業入口網站/2.教育訓練教材及線上考卷/frontend/src/components/admin/ExamStudio.tsx)
  - 訓練計畫與報到總覽相關頁面元件（依現況路徑補齊）

## 里程碑

- M1：Hybrid scope resolver + 後端查詢套用完成
- M2：成績中心列印流程（問答、模式、多計畫、清單能力）完成
- M3：報到總覽一致性與批次請假原因完成
- M4：考卷工坊 UI/互動增強完成
- M5：考試中心與訓練計畫補強 + 全面回歸測試完成

## 第二階段需求調整與實作準則（最新）

- 前端在「填寫/批次填寫請假原因」操作後，需立即反映四卡人數變化；不可等待手動重整。
- 後端在同一請求內即時落庫（commit），並回傳最新統計；前端直接套用回傳值更新畫面。
- 單一口徑原則：卡片與清單統計統一由 `GET /training/plans/{plan_id}/attendance/stats`（或更新 API 回傳的 `stats`）提供，前端不再自行發明第二套計算邏輯。
- 報到總覽與訓練計畫管理兩個報到統計 Modal 必須使用同一組互動規則：
  - 未到與請假卡都可觸發批次按鈕。
  - 批次功能改為「全選/不全選 + 勾選多人」。
  - 支援「取消請假」選項（單筆/批次皆可）。
- 列印目前清單維持與畫面同口徑：
  - 清單篩選改中文且高亮。
  - 列印清單隔列 Highlight。
  - 新增頁碼（第 N 頁）。
- 報到統計四卡數字一致性補強：
  - `AttendanceStats` response model 補齊 `leave_count`、`absent_without_reason_count`，避免 FastAPI 回應過濾欄位造成前端卡片顯示錯誤。
  - 前端卡片完全使用後端回傳統計欄位，不再用 `expected-actual` 當主要來源。
  - 操作後（單筆/批次）直接套用更新 API 回傳的 `stats`，確保即時更新且單一口徑。
- 視覺可辨識性修正（對應 T13 L34）：
  - 點擊中的統計卡片改為「邊框加粗 + 顏色加深 + ring 強化」，可明確辨識目前選中卡片。

## 使用者已驗收（你確認 OK）

- [x] 報到列印：
  - [x] 列印清單篩選中文高亮
  - [x] PDF 頁碼（第 N 頁）
  - [x] 列印隔列 Highlight
- [x] 取消請假（單筆/批次）：
  - [x] 報到總覽可用
  - [x] 成績中心可用

