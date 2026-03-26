# T13 任務 To-Do Check List

依據：`0.standards/2.棕地專案/T13_PLAN.md`

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
- [ ] 後端單元測試：`pytest`（目前環境未安裝 pytest）
- [ ] UAT：部門範圍角色 vs 全域角色完整流程驗證

## E. 文件同步

- [x] `README.md` 已補充 T13 近期更新
- [x] `1.docs/README.md` 已補充 T13 計劃索引與更新
- [x] `0.standards/README.md` 已補充 T13 計劃連結
- [x] `1.docs/plans/T13_可行執行計劃.md` 已建立
- [x] 本檔案（T13 任務核對清單）已建立

## F. 目前已知問題 / 待確認

- [x] 考卷工坊批次刪除 422：已修正路由衝突（改 `bulk-delete`）
- [ ] 以實機再次驗證「2025 資訊部 AI 運用訓練」批次刪除流程
- [ ] 若需保留舊路徑相容（`/bulk`），可再加 alias 路由
