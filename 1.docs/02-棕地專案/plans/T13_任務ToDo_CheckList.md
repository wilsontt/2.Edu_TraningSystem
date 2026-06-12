# T13 任務 To-Do Check List

依據：`1.docs/02-棕地專案/規格與計畫/T13_PLAN.md`

> **狀態補註（2026-05-02）**：§D 之 `pytest`、UAT 兩項仍為 `[ ]`（分別為可選測試與人工作業）；§F 其餘已勾選或結案。詳見檔末附錄。

## A. Phase 0：需求與規則凍結

- [x] 角色映射規則確認並落地（部門範圍角色 / 全域角色）
- [x] 請假判定規則落地（`absence_reason_code` 有值即請假）
- [x] 列印欄位與列印選項（簽名/歷程）完成 API 與前端選項串接

## B. Phase 1：後端 API 與資料範圍控制

- [x] 成績列印預覽 API：`POST /api/admin/reports/print/preview`
- [x] 成績列印 PDF API：`POST /api/admin/reports/print/pdf`
- [x] 報表匯出 API 權限補回：`GET /api/admin/reports/export/pdf`
- [x] 報表資料範圍控制（report 主要統計端點已套用）
- [x] 報到統計擴充：`leave_count`、`absent_without_reason_count`
- [x] 考卷工坊題目批次刪除 API：`DELETE /api/admin/exams/questions/bulk-delete`
- [x] 題庫批次刪除 API：`DELETE /api/admin/question-bank/bulk-delete`

## C. Phase 2：前端功能增修

- [x] 成績中心新增「成績列印」頁籤（多人勾選、全選/不全選、預覽、下載）
- [x] 報到總覽固定顯示 active 計畫
- [x] 報到統計卡片切換單一清單（應到/實到/未到/請假）
- [x] 報到總覽可列印目前清單
- [x] 考卷工坊題目清單支援全選/不全選與批次刪除
- [x] 題庫維護支援全選/不全選與批次刪除
- [x] 考試中心未報到提示 Modal 與「立即報到」

## D. Phase 3：測試與驗收

- [x] 後端語法檢查：`python -m compileall app`
- [x] 前端建置檢查：`npm run -s build`
- [ ] 後端單元測試：`pytest` — **未列為發版必備**（`requirements.txt` 無 pytest）。屬**可選強化**；若要執行：
  1. `cd backend && .venv/bin/pip install pytest`
  2. 於 `backend/` 下：`pytest`（需專案內已有測試模組），或依 `tests/README.md` 執行 `tests/test_new_apis.py`（**需先啟動後端** API）。
- [ ] UAT：部門範圍角色 vs 全域角色 — **程式已實作**（`backend/app/access_scope.py` 與各 router 範圍過濾）；本項為**人工作業驗收**。建議步驟：
  1. 備兩組帳號：一般部門範圍（如副理／課長類，非 Admin）與 Admin（或「系統管理」類全域角色）。
  2. 部門帳登入：開啟**成績中心**（統計／部門績效）、**報到總覽**、**部門成員批次列印**，確認僅見授權範圍內計畫與人員；嘗試以 URL 或他人 `emp_id` 存取應回 403 或空資料（依端點設計）。
  3. Admin 登入：同一路徑應可見跨部門資料（若角色為全域）。
  4. 通過後可將本項改為 `[x]` 並註記驗收日期。

## E. 文件同步

- [x] `README.md` 已補充 T13 近期更新
- [x] `1.docs/README.md` 已補充 T13 計劃索引與更新
- [x] `1.docs/00-專案總覽/專案說明.md`（原 `0.standards/README.md`）已補充 T13 計劃連結
- [x] `1.docs/plans/T13_可行執行計劃.md` 已建立
- [x] 本檔案（T13 任務核對清單）已建立

## F. 目前已知問題 / 待確認

- [x] 考卷工坊批次刪除 422：已修正路由衝突（改 `bulk-delete`）
- [x] 以實機再次驗證「2025 資訊部 AI 運用訓練」批次刪除流程 — **路由面已修正**；抽驗步驟（計畫名稱可換成環境內任一計畫）：登入具 `menu:exam` → 考卷工坊 → 選定計畫 → 題目列表多選 → **批次刪除** → 確認 HTTP 2xx 且列表刷新、無 422。若無該計畫名稱，以上述流程對任意計畫驗證即可。
- [x] 若需保留舊路徑相容（`/bulk`）— **已決議不實作**。現行端點：`DELETE /api/admin/exams/questions/bulk-delete`、`DELETE /api/admin/question-bank/bulk-delete`；無外部系統依賴舊 `/bulk` 時無需 alias。

---

### 附錄：D／F 未勾項之結論（2026-05-02）

| 項目 | 結論 |
|------|------|
| D. `pytest` | 非程式缺漏；為 CI／測試策略項目。要驗證時依上列步驟執行。 |
| D. UAT 角色範圍 | 非單一 commit 可勾；建議排定 UAT 窗口後依步驟勾選完成。 |
| F. 實機批次刪除 | 與 `422` 修正為同一能力；抽驗通過即視為本項完成。 |
| F. `/bulk` alias | 不需要。 |
