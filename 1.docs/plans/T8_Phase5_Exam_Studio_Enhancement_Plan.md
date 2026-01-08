# 實作計畫：考卷工坊與訓練計畫增強 (Phase 5)

## 目標
應使用者要求，針對「考卷工坊」與「訓練計畫」進行一系列功能增強與修復。

---

## 1. 考卷工坊 (Exam Studio)

### 1.1 TXT 拖拉上傳修復
- **問題**：目前拖拉上傳無反應或失敗。
- **原因**：前端 `onDrop` 事件處理可能未正確提取 `DataTransfer.files` 或與點擊上傳邏輯衝突。
- **解決方案**：
  - 檢查 `ExamStudio.tsx` 的 `onDrop` 函數。
  - 確保 `e.preventDefault()` 被正確呼叫。
  - 確保直接傳遞 `files` 給 `handleFileUpload`。

### 1.2 題庫化與標籤 (Question Bank & Tags)
- **問題**：目前題目僅綁定於單一 `TrainingPlan`，無法跨計畫重複使用或查詢。
- **需求**：
  - 將解析後的題目存入「題庫」供日後使用。
  - 每個題目需至少有一個標籤 (Tag) 以便查詢。
- **解決方案**：
  - **資料庫變更**：
    - 新增 `question_bank` 表格：
      - `id`: Integer, PK
      - `content`: Text (題目內容)
      - `question_type`: String (題型)
      - `options`: Text (JSON string)
      - `answer`: String
      - `tags`: Text (JSON array, e.g. `["Java", "Basic"]`)
      - `created_by`: String (Emp ID)
    - (Option) 考慮是否將現有 `Question` 模型改為指向 `question_bank_id`，或保持獨立但提供「從題庫匯入」功能。**決策：保持獨立，提供「匯入」功能，以免修改單一考卷時影響原始題庫。**
  - **後端 API**：
    - `POST /admin/exams/upload`: 解析 TXT 後，除了建立 `Question` (綁定 Plan)，同時將題目寫入 `question_bank` (若內容不重複)。自動依照 Plan Title 或 Category 加上預設標籤。
    - `GET /admin/question-bank`: 查詢題庫。**必須支援後端分頁 (Pagination)** 與篩選：
        - `page`: 頁碼 (default 1)
        - `size`: 每頁筆數 (default 20, max 100)
        - `keyword`: 關鍵字搜尋 (題目內容)
        - `tags`: 標籤篩選
        - `question_type`: 題型篩選
    - `PUT /admin/question-bank/{id}`: 維護/編輯題庫題目。
    - `DELETE /admin/question-bank/{id}`: 刪除題庫題目。
    - `POST /admin/exams/import`: 從題庫選取題目 -> 複製並新增至特定 Plan (與原題庫脫鉤)。
  - **前端介面 (ExamStudio)**：
    - **新增「題庫維護」模式**：在標題右側新增模式切換按鈕，進入「歷史題庫維護」視圖。
      - **篩選工具列**：包含關鍵字搜尋框、題型下拉選單、標籤下拉選單。
      - **資料列表**：使用**分頁表格 (Table)** 呈現，顯示 題目摘要、題型、標籤、選項預覽。
      - **批次操作**：(Optional) 支援多選刪除。
    - **匯入功能**：在原本的計畫題目列表區，新增「從題庫匯入」按鈕。
      - 跳出 Modal 顯示**可搜尋/分頁**的題庫列表，勾選後匯入。

---

## 2. 訓練計畫管理 (Training Plan Manager)

### 2.1 行動裝置編輯按鈕修復
- **問題**：手機版看不到編輯筆圖示 (因使用 `opacity-0 group-hover:opacity-100`，手機無 hover)。
- **解決方案**：
  - 修改 CSS：在小螢幕 (`sm:hidden` 或預設) 下強制 `opacity-100`，或完全移除 `opacity` 效果改為恆顯。
  - 建議：`opacity-100 sm:opacity-0 sm:group-hover:opacity-100` (手機恆顯，桌機 Hover 顯)。

### 2.2 鎖定開始日期
- **需求**：當有人開始考試後，計畫的「開始日期」不可變更。
- **解決方案**：
  - **後端 (`update_training_plan`)**：
    - 檢查該 Plan 是否已有 `ExamRecord`。
    - 若 `counts(exam_records) > 0` 且 `new_start_date != old_start_date`，拋出 400 錯誤：「已有學員開始考試，無法變更開始日期」。
  - **前端**：若後端回傳錯誤，顯示 Alert。

### 2.3 過期計畫醒目顯示
- **需求**：過了結束日期的計畫，邊框用橙色顯示。
- **解決方案**：
  - 前端表格渲染時，比較 `today` 與 `plan.end_date`。
  - 若 `today > end_date`，在 `tr` 或 `td` 加上 `border-orange-400` 或背景色標示。

### 2.4 新增結束日期欄位
- **需求**：列表多一欄「結束日期」。
- **解決方案**：
  - 前端表格 Header 新增「結束日期」。
  - Body 對應欄位顯示 `plan.end_date`。

---

## 執行步驟

1. **Frontend (Plan)**: 修改 `TrainingPlanManager.tsx` (手機按鈕、結束日期欄、過期樣式)。
2. **Backend (Plan)**: 修改 `routers/training.py` (鎖定開始日期邏輯)。
3. **Database (Bank)**: 建立 `question_bank` 表格 (Migration Script)。
4. **Backend (Bank)**:
   - 新增 `routers/question_bank.py` 或整合進 `admin.py`。
   - 實作分頁查詢、編輯、刪除 API。
   - 修改 TXT 上傳解析邏輯 (`upload`)，同步寫入題庫。
   - 實作 `import` API。
5. **Frontend (Studio)**:
   - 修復 `onDrop`。
   - 實作「題庫維護」模式 (分頁列表、篩選、編輯、刪除)。
   - 實作「從題庫匯入」Modal (分頁列表、篩選、多選匯入)。

## 使用者審核 Required
- [x] 同意 **題庫** 採分離設計 (TrainingPlan 內的題目修改不影響題庫，反之亦然)
- [x] 同意 **Tag** 來源先以 Plan Title/Category 自動產生
- [x] 同意 **分頁與篩選** 機制以應對大量題目

## 3. 額外優化 (Enhancements)

### 3.1 全站列表樣式統一 (Standardized UI)
- **需求**：所有管理列表 (訓練計畫、題庫、考卷工坊右側) 及 前台列表 (考試中心) 需樣式一致。
- **實作細節**：
  - **隔行變色 (Zebra-striping)**: 偶數行背景色 `bg-gray-100/60`。
  - **Hover 效果**: 深藍色背景 `hover:bg-blue-50/80` (卡片模式則為 `hover:shadow-md` + 藍色邊框/背景)。
  - **選取狀態**: 明顯的藍色左邊框與背景，確保不被隔行變色覆蓋。

### 3.2 題庫匯入重複檢查
- **需求**：匯入題目時，需檢查是否與該計畫內現有題目重複 (Content 比對)。
- **實作細節**：
  - 後端 API 回傳詳細統計：`imported` (成功), `duplicate` (重複), `failed` (失敗)。
  - 前端顯示詳細回饋訊息。

### 3.3 上傳時間顯示
- **需求**：考卷列表需顯示檔案上傳時間。
- **實作細節**：API 回傳 `upload_time`，前端於檔名下方顯示。

## 執行狀態 (Status)
- [x] **Phase 5.1 Question Bank**: 已完成資料庫、API、前端管理介面。
- [x] **Phase 5.2 Import**: 已完成從題庫匯入、重複檢查。
- [x] **Phase 5.3 UI Refinement**: 已完成全站列表樣式統一。
