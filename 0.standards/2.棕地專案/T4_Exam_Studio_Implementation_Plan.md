# T4: 考卷工坊與 AI 出題 (Exam Studio) 實作計畫

## 目標
建立一個智慧化的考卷製作中心，支援 **直接上傳 TXT 考卷** (自動解析並匯入題庫)，以及從教材 AI 自動生成 (未來擴充)。

## 涵蓋任務
- [x] T4.1: 實作 TXT 檔案解析器 (Parser) 與題目儲存邏輯 (Modified to handle Import directly)
- [ ] T4.2: 整合 Gemini/GPT API 實作 AI 題目生成 (Future/Pending)
- [ ] T4.3: 實作「題目編修介面」 (Question Editor)
- [x] T4.4: 實作考卷上傳與預覽功能 (Drag & Drop, Preview)

## 1. 後端架構 (Backend)

### A. 檔案上傳與教材管理 (T4.4)
- **目錄結構**: `backend/data/materials/{year}/{plan_id}/`
- **API**:
    - `POST /admin/exams/upload`: 上傳教材檔案 (目前僅支援 TXT)
    - `GET /admin/exams/materials/{plan_id}`: 列出該計畫已上傳的教材

### B. AI 題目生成引擎 (T4.2)
- **Service**: `backend/app/services/ai_generator.py`
- **Logic**:
    1. 讀取 TXT 內容。
    2. 組裝 Prompt (包含題目類型、數量要求、JSON 格式範例)。
    3. 呼叫 Gemini API (需配置 API Key)。
    4. 解析回傳的 JSON 字串。
- **API**:
    - `POST /admin/exams/generate`: 觸發 AI 生成 (Input: `file_path`, `options`: {types, count})

### C. 題目解析與儲存 (T4.1)
- **Service**: `backend/app/services/parser.py`
- **Logic**:
    - 定義標準題目格式 (Markdown/JSON)。
    - 將 AI 生成的 Draft 暫存於 Memory 或 Temporary Table，直到 User 確認儲存。
- **Database**:
    - 使用現有的 `Question` table。
    - 新增 `DraftQuestion` table? (Optional, 或直接在前端處理 Draft 狀態) -> **決定在前端處理 Draft 狀態，User 按下「儲存」才寫入 DB。**

## 2. 前端架構 (Frontend)

### A. ExamStudio.tsx (Entry)
- **Route**: `/admin/exams` (需在 `App.tsx` 註冊)
- **Layout**:
    - 左側: 計畫選擇與教材上傳區。
    - 右側: 題目編輯與預覽區。

### C. 題目編修介面 (T4.3) (New)
- **Goal**: 提供介面讓使用者修改已匯入或生成的題目。
- **Components**:
    - `QuestionList`: 顯示目前的題目列表 (已實作)。
    - `QuestionEditorModal`: 編輯單一題目的彈跳視窗。
- **Features**:
    - **Edit**: 修改題目內容、選項、正確答案、分數、題型。
    - **Delete**: 刪除單一題目。
    - **Validation**: 確保 JSON 選項格式正確，確保答案在選項內。
- **API**:
    - `PUT /admin/exams/questions/{question_id}`: 更新題目。
    - `DELETE /admin/exams/questions/{question_id}`: 刪除題目。

## 3. 實作步驟

1.  **Environment Setup**: 配置 Gemini API Key (`.env`) (Pending).
2.  **Backend - Upload**: 實作檔案上傳 API 與目錄管理 (Done).
3.  **Backend - CRUD**: 實作 `PUT` 與 `DELETE` questions API for Editor.
4.  **Frontend - UI**: 搭建 `ExamStudio` 基本框架 (Done).
5.  **Frontend - Editor**: 實作 `QuestionEditorModal` 並整合至列表。
6.  **Integration**: 串接上傳 -> 生成 -> 編輯 -> 儲存 流程。

## 4. 驗證計畫
1.  上傳一個測試用的 TXT 教材。
2.  點擊生成，確認能收到 AI 回傳的 JSON 題目。
3.  在前端修改其中一題的答案。
4.  點擊儲存，確認題目寫入 SQL `questions` table。
