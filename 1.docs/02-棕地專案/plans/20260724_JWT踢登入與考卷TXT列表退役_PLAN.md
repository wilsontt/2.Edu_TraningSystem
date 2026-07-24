# JWT 踢登入與考卷 TXT 列表退役 Implementation Plan

> **狀態**：✅ 程式已實作（2026-07-24）；待人工瀏覽器驗收後移入 `plans/已完成/`。  
> **產品決議**：考卷工坊「已匯入考卷檔」整塊拿掉（方案 1）；TXT 僅為一次性匯入載體。

**Goal:** （1）API 回 401 時自動清除登入並導回登入頁；（2）考卷工坊不再列出／預覽／刪除 NAS 上的考卷 TXT，題目生命週期改以本計畫題目與歷史題庫為準。

**Architecture:**  
- 前端 Axios response interceptor 統一處理 401（略過登入相關公開端點），清 token／session，導向 `/training/login`，並通知 `App` 清 `user`。  
- `ExamStudio` 移除 materials 狀態、`fetchMaterials`、已匯入考卷檔 UI、TXT 預覽 Modal。  
- 後端 `GET/DELETE .../materials*` 與 `GET .../materials/preview*` 改回 **410 Gone**；`POST /upload/preview` + `import-from-preview` 維持主路徑。舊 `POST /upload`（寫 NAS）暫保留為相容／腳本用。

**Tech Stack:** React／Axios、FastAPI、既有 pytest。

## Global Constraints

- 回覆與文件使用繁體中文。  
- TypeScript 禁用 `any`。  
- 不擴大範圍：不改教材庫 interactive NAS；不強制刪 NAS 既有 `exams/` 實體檔。

---

## 作業內容

### Task 1：JWT 401 → 踢回登入

- [x] `frontend/src/api.ts`：response interceptor；公開 auth 路徑不觸發踢出。  
- [x] `frontend/src/App.tsx`：聆聽 `auth:session-expired`，`setUser(null)` + 清 session。  
- [x] `frontend/src/utils/sessionUser.ts`：提供 `clearSessionUser`。

### Task 2：前端拿掉「已匯入考卷檔」

- [x] `ExamStudio.tsx`：移除 materials／NAS warning／檔案預覽相關程式與 UI。  
- [x] 選計畫時只 `fetchQuestions`。  
- [x] 上傳文案微調；標題改「本計畫題目」。

### Task 3：後端 materials 端點退役

- [x] `list_materials`、`preview_material`、`delete_material` → HTTP 410。  
- [x] 更新 `tests/test_exam_list_materials_nas.py` 為 410 期望。  
- [x] `main.py`：`X-NAS-Unavailable` 註解標為遺留。

### Task 4：文件同步

- [x] `棕地功能總覽.md`  
- [x] `1.docs/README.md`／`交付實作文件/README.md`  
- [x] `生產部署指南.md`

### Task 5：驗證

- [x] `pytest tests/test_exam_list_materials_nas.py -q`（3 passed）  
- [x] `npm run lint`／`tsc --noEmit` 通過

> **狀態**：✅ 程式已實作（2026-07-24）；待人工瀏覽器驗收後移入 `plans/已完成/`。

## 驗收

| # | 項目 | 預期 |
|---|------|------|
| 1 | 偽造／過期 JWT 呼叫受保護 API | 前端導向登入頁 |
| 2 | 進入考卷工坊選計畫 | 無「已匯入考卷檔」、無 NAS 琥珀色提示 |
| 3 | TXT 上傳預覽＋勾選匯入 | 題目寫入本計畫；不依賴 NAS |
| 4 | `GET /api/admin/exams/materials/{id}` | 410 |

## 參考

- 對話產品決議 2026-07-24。  
- 舊行為：[20260717 PLAN](20260717_報到-訓練計畫-教材-題庫_新增需求_PLAN.md) E 考卷 NAS list 韌性（本 PLAN 廢止 UI 依賴）。
