# T4: 考卷工坊與 AI 出題 (Exam Studio) 實作計畫

## 目標
建立一個智慧化的考卷製作中心，支援 **直接上傳 TXT 考卷** (自動解析並匯入題庫)，以及從教材 AI 自動生成 (未來擴充)。

## 涵蓋任務

> **狀態補註（2026-05-02）**：T4.2（雲端 AI 自動出題）**取消不做**，不納入本產品路線圖。T4.3 所指之「題目編修」已透過**考卷工坊**（`ExamStudio.tsx` 等）與**題庫維護**之編輯／刪除流程落地，非獨立「AI 草稿編輯器」模組。

- [x] T4.1: 實作 TXT 檔案解析器 (Parser) 與題目儲存邏輯 (Modified to handle Import directly)
- [x] ~~T4.2: 整合 Gemini/GPT API 實作 AI 題目生成~~ **（已取消，不實作）**
- [x] T4.3: 題目編修介面（考卷工坊＋題庫維護之題目編輯／刪除，已落地）
- [x] T4.4: 實作考卷上傳與預覽功能 (Drag & Drop, Preview)

## 1. 後端架構 (Backend)

### A. 檔案上傳與教材管理 (T4.4)
- **目錄結構**: `backend/data/materials/{year}/{plan_id}/`
- **API**:
    - `POST /admin/exams/upload`: 上傳教材檔案 (目前僅支援 TXT)
    - `GET /admin/exams/materials/{plan_id}`: 列出該計畫已上傳的教材

### B. AI 題目生成引擎 (T4.2) — **已取消**

- 不實作雲端 LLM 自動出題；若未來重啟需求，需另立規格與資安評估。

### C. 題目解析與儲存 (T4.1)
- **Service**: `backend/app/services/parser.py`
- **Logic**:
    - 定義標準題目格式 (Markdown/JSON)。
    - TXT 解析結果可於前端暫存，使用者確認後寫入 DB（T4.2 取消後無「AI Draft」管線）。
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

1.  ~~**Environment Setup**: 配置 Gemini API Key~~（隨 T4.2 取消，略）。
2.  **Backend - Upload**: 實作檔案上傳 API 與目錄管理 (Done)。
3.  **Backend - CRUD**: 實作題目更新／刪除 API，供考卷工坊與題庫維護使用 (Done)。
4.  **Frontend - UI**: 搭建 `ExamStudio` 基本框架 (Done)。
5.  **Frontend - Editor**: 考卷工坊與題庫維護之題目編修 UI (Done)。
6.  **Integration**: 串接「上傳 TXT → 解析匯入 → 編輯／儲存」流程（無 AI 生成步驟）。

## 4. 驗證計畫

1. 上傳測試用 TXT 教材，確認解析與題目寫入。
2. 於考卷工坊或題庫維護開啟題目編輯，修改內容／選項／答案後儲存，確認 `questions` 表更新。
3. ~~AI 生成 JSON~~（已不適用）。

> 本檔為 T4 計畫之唯一定稿（原 `0.standards/2.棕地專案` 重複副本已於文件整併時移除）。
