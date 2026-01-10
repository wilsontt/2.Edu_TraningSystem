# T5: 考試中心與評分引擎 (Exam Center) 實作計畫

## 目標
建立一個「學員端」的考試中心，提供行動裝置友善的作答介面，支援自動計分、倒數計時，以及模擬真實考卷的成績顯示。

## 涵蓋任務
- [ ] T5.1: 實作「行動端優先」的分頁作答介面 (支援手機滑動)
- [ ] T5.2: 實作倒數計時器組件 (可由計畫設定開啟/關閉)
- [ ] T5.3: 實作自動計分邏輯與答題暫存 (LocalStorage/Server)
- [ ] T5.4: 實作「紅字手寫風格」成績顯示頁面 (CSS/Framer Motion)
- [ ] T5.5: 實作「個人考試中心」首頁 (User Dashboard) - 列出待考與歷史紀錄

## 1. 資料庫結構 (Database)

### A. schema 修改/新增
- **ExamResult (考卷成績)**
    - `id`: PK
    - `plan_id`: FK (關聯 TrainingPlan)
    - `user_id`: FK (關聯 User)
    - `score`: int (總分)
    - `answers`: JSON (使用者的答題紀錄，如 `{"1": "A", "2": "Y"}`)
    - `graded_at`: datetime (交卷時間)
    - `time_spent`: int (作答耗時，秒)

## 2. 後端 API (Backend)

- **GET /exam/my_exams**: 取得登入使用者的考試列表 (待考/已考)。
    - Filter by `user_id`.
    - Join `TrainingPlan` to get details.
    
- **GET /exam/start/{plan_id}**: 開始考試 (取得題目)。
    - Check time range (Start Date/End Date).
    - Check if already submitted.
    - Return questions list (without answers ideally, or answers inside if frontend grading - *Strategy: Security vs Convenience. For now, send questions without answers. Submit to grade.*) -> **Decision: Send questions without answers.**

- **POST /exam/submit/{plan_id}**: 交卷。
    - Input: `{"answers": {"question_id": "answer_key", ...}, "time_spent": 300}`.
    - Logic: 
        1. Fetch correct answers from DB.
        2. Calculate score.
        3. Save `ExamResult`.
    - Return: `score`, `correct_map`, etc.

## 3. 前端架構 (Frontend)

### A. Routes
- `/exam`: 考試中心首頁 (Dashboard)。
- `/exam/run/:planId`: 作答介面 (Fullscreen mode recommended).
- `/exam/result/:resultId`: 成績查看頁面。

### B. Components
- **ExamList**: 卡片式列表，顯示考試狀態 (未開始、進行中、已結束)。
- **ExamRunner**:
    - **Pagination**: 一次一題或列表式 (T5.1 request: "Pagination"). Let's do Card Swiping or Stepper.
    - **Timer**: 懸浮或固定頂部的倒數計時器。
    - **LocalStorageHook**: `useExamProgress` to save answers in case of refresh.
- **ScoreCard**: 紅筆風格的成績顯示 (Animated).

## 4. 實作步驟

### Phase 1: 基礎建設 & Dashboard (T5.5)
1.  建立 DB Models (`ExamResult`).
2.  建立 Backend API (`my_exams`).
3.  建立 Frontend `/exam` page & Layout.

### Phase 2: 考試介面與計時 (T5.1, T5.2)
1.  建立 Backend `get_questions` (public/student accessible).
2.  實作 `ExamRunner` 介面 (Mobile First styles).
3.  實作 `Timer` component.

### Phase 3: 評分與展示 (T5.3, T5.4)
1.  實作 Backend `submit_exam` 邏輯 (Auto-grading).
2.  實作 Frontend 結果頁面 (`ScoreCard` with animation).

## 5. 驗證計畫
1.  身為學員，可以看到指派給我的考試。
2.  進入考試，計時器開始倒數。
3.  作答並重新整理，確認答案保留 (LocalStorage)。
4.  交卷，確認後端算出正確分數。
5.  查看成績單，確認視覺效果。
