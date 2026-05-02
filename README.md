# 教育訓練教材及線上考卷系統

![版本](https://img.shields.io/badge/版本-v1.2.0-blue) ![狀態](https://img.shields.io/badge/狀態-穩定版-green)

![React](https://img.shields.io/badge/React-19+-61DAFB?logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white) ![Python](https://img.shields.io/badge/Python-3+-3776AB?logo=python&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4+-38B2AC?logo=tailwind-css&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-7+-646CFF?logo=vite&logoColor=white)

企業內部**教育訓練與線上考卷**系統，支援不定期訓練、新進訓後測驗、報到管理、成績統計與 RBAC 權限管理。徽章使用依 [徽章使用規範](0.standards/1.綠地專案文件/徽章使用規範.md)。

---

## 一、目的與範圍

| 項目 | 說明 |
|------|------|
| **目的** | 提供教育訓練計畫管理、考卷出題與上傳、線上作答與評分、成績查詢與 PDF 成績單，並支援 QRcode 登入／報到與角色權限控管。 |
| **範圍** | 前端 React SPA、後端 FastAPI REST API、SQLite 單機版資料庫；文件與規範位於 `0.standards/`、`1.docs/`。 |

---

## 二、核心功能

| 模組 | 說明 |
|------|------|
| **登入與權限** | 員工編號 + 圖形驗證碼登入；QRcode 快速登入（多人共用仍須輸入編號與驗證碼）；RBAC 角色與功能選單配置。 |
| **訓練計畫** | 年度計畫、受課單位／個人授課對象、封存、頁籤（進行中／已過期／已封存）、篩選與排序。 |
| **報到** | 考試前報到、應到／實到統計、報到 QRcode 產生與掃描；**報到總覽**（功能碼 `menu:attendance-overview`）可檢視各訓練計畫報到統計並編輯未到原因；**已封存**計畫在報到總覽僅能檢視、不可編輯原因。 |
| **考卷工坊** | TXT 題目上傳與解析、題庫維護、從題庫匯入、教材上傳與預覽。 |
| **考試中心** | 依訓練計畫應考、作答、提交、即時評分、重考機制；行動優先響應式介面。 |
| **成績中心** | 管理端報表含**外層雙頁籤**（統計報表／部門績效表現）；部門路徑含手風琴展開、**部門成員成績批次列印**（三步驟精靈、名單含出席／請假時間）；`individual` 與個人「成績詳情 → 預覽成績單 → 列印」**同源 HTML**；`list` 為後端 PDF；展開區成員表以 **`ch` 欄寬常數** 集中維護。個人端成績總覽、學習分析、歷程與 PDF 導出維持既有能力。 |

---

## 三、快速啟動

### 環境需求

- **後端**：Python 3.x、虛擬環境（建議 `.venv`）
- **前端**：Node.js 18+、npm 或等效套件管理員

### 1. 資料庫初始化（僅首次或資料庫不存在時）

```bash
cd backend
.venv/bin/python3 -c "from app.init_db import init_db; init_db()"
```

> ⚠️ 會建立所有資料表並寫入基礎資料（角色、部門、選單等）。若資料庫已存在請先備份。詳見 [資料庫遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md)。

### 2. 後端

```bash
cd backend
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API 文件：<http://localhost:8000/docs>
- 使用 `--host 0.0.0.0` 可讓區網裝置（如手機）連線

### 3. 前端

```bash
cd frontend
npm install
npm run dev
```

- 開發站：<http://localhost:5173>（或 Vite 顯示的區網網址）

後端啟動時會自動建立不存在的資料表，但**不會**寫入基礎資料；首次使用請先執行步驟 1。

---

## 四、專案結構與技術堆疊

### 4.1 技術堆疊

| 層級 | 技術 |
|------|------|
| **前端** | React 19、TypeScript、Vite、Tailwind CSS、React Router、Axios、Lucide React、Framer Motion、Recharts |
| **後端** | FastAPI、SQLAlchemy、Pydantic、python-jose、Pillow、ReportLab、qrcode、python-multipart |
| **資料庫** | SQLite（`data/education_training.db`） |

### 4.2 目錄結構

| 目錄 | 說明 |
|------|------|
| **0.standards/** | 專案憲章、綠地／棕地規範、規格／計畫／任務、架構與使用說明 |
| **1.docs/** | 開發文件索引、架構分析、驗收流程、實作計畫、**交付實作文件**（棕地迭代任務與驗收追溯）、報告、測試與修復記錄、資料庫遷移 |
| **backend/** | FastAPI 應用（`app/`）、路由／模型／服務；`restore_training_data.py` 為資料恢復腳本 |
| **frontend/** | React 應用、頁面與元件、API、樣式 |
| **data/** | SQLite 資料庫、教材與上傳檔案目錄 |
| **tests/** | 測試腳本 |

---

## 五、規範與文件索引

本專案依 **規格驅動開發 (SDD)**：規格 → 計畫 → 任務 → 執行 → 驗收。核心規範見 [專案憲章](0.standards/1.綠地專案文件/0.專案憲章.md)。

### 綠地專案（新功能）

- [1.spec.md](0.standards/1.綠地專案文件/1.spec.md) — 使用者故事與需求  
- [2.plan.md](0.standards/1.綠地專案文件/2.plan.md) — 技術計畫  
- [3.tasks.md](0.standards/1.綠地專案文件/3.tasks.md) — 開發任務清單  

### 棕地專案（既有功能增強）

- [成績中心功能計劃](0.standards/2.棕地專案/1.成績中心功能計劃.md)  
- [成績中心開發任務](0.standards/2.棕地專案/2.成績中心開發任務.md)  
- [專案架構分析](0.standards/2.棕地專案/0.專案架構分析.md)  

### 開發與驗收

- [0.standards 說明與入口](0.standards/README.md) — 專案概述、快速啟動、文件索引  
- [專案系統架構分析](0.standards/專案系統架構分析.md) — 系統架構、流程、資料庫、技術棧  
- [專案使用說明](0.standards/專案使用說明.md) — 使用情境、操作步驟、常見問題  
- [1.docs 開發文件目錄](1.docs/README.md) — 架構分析、角色權限說明、計畫、報告、測試記錄  
- [交付實作文件索引](1.docs/交付實作文件/README.md) — 成績中心棕地迭代（2026-04～05）任務單與完成狀態  
- [驗收報告建立流程](1.docs/驗收報告建立流程.md) — 任務驗收清單、報告格式與存放規則  

---

## 六、重要注意事項

### 資料庫

1. **備份**：任何資料庫操作前請備份 `data/education_training.db`（建議檔名含時間戳）。  
2. **初始化**：僅在首次或無資料庫時執行 `init_db()`；否則可能覆寫或遺失資料。  
3. **恢復**：可參考 [資料庫資料遺失與恢復記錄](1.docs/reviews/2025-01-09-資料庫資料遺失與恢復記錄.md) 與 `backend/restore_training_data.py`。  
4. **遷移**：表結構變更請依 [資料庫遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md) 處理。  
5. **結構說明**：全表欄位與關聯見 [education_training.db 結構分析](1.docs/資料庫結構分析/education_training_db_結構分析.md)。  

### Docker 與成績 PDF 字型

本系統有**兩種成績輸出**，字型來源不同，視覺差異屬預期：

| 輸出 | 觸發方式 | 字型來源 |
|------|----------|----------|
| **考卷成績單**（HTML 列印） | 批次列印精靈 → individual 路徑 → 瀏覽器列印 | 使用者**客戶端**作業系統字型（`CHINESE_FONT_STACK`，見 `frontend/src/components/personal/scoreCardPrintHtml.ts`） |
| **考試成績清單**（ReportLab PDF） | 批次列印精靈 → list 路徑 → 後端 PDF | **後端容器**內字型（`register_chinese_fonts()`，見 `backend/app/routers/report.py`） |

**Docker 部署注意事項**：

- `Dockerfile.backend` 在 `apt-get` 安裝 `fonts-wqy-microhei`（路徑：`/usr/share/fonts/truetype/wqy/wqy-microhei.ttc`）與 `fonts-noto-cjk`（路徑：`/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`），確保容器內 PDF 能嵌入繁體中文字型。  
- 若未安裝 CJK 字型，`register_chinese_fonts()` 會退回 Helvetica，導致 PDF 中文亂碼或欄位對不齊。  
- 兩種輸出字型本質上不同（客戶端 vs. 容器），輕微視覺差異屬正常；異常指標為「PDF 中文無法閱讀或欄位嚴重錯位」。

---

## 七、開發進度摘要

依 [3.tasks.md](0.standards/1.綠地專案文件/3.tasks.md) 與棕地計畫：

| 區塊 | 狀態（2026-05-01） |
|------|-------------------|
| **T1～T3** | 基礎環境、認證 RBAC、訓練行政 — 已於產品線運作 |
| **T4 考卷工坊** | TXT 解析、題庫、教材上傳等 — 已上線；**AI 出題／草稿編輯器** 仍屬規劃中（見綠地計畫與 `plans/`） |
| **T5～T7** | 考試中心、系統管理與報表、UX — 已上線 |
| **棕地成績中心（2026-04～05）** | 部門績效外層頁籤、成員批次列印（list PDF／individual 與個人預覽同源）、展開成員表欄寬與版面 — **已結案**；追溯見 [交付實作文件 README](1.docs/交付實作文件/README.md)、[T13 測試問題補註](0.standards/2.棕地專案/T13%20增修功能實作PLAN_測試問題.md) 檔首 |
| **歷史 Phase 3 任務清單** | [2.成績中心開發任務.md](0.standards/2.棕地專案/2.成績中心開發任務.md) 內 `- [ ]` 為**歷史規劃**，未與現況逐條同步，請以程式與交付文件為準 |

綠地階段性「驗收報告」目錄若仍為佔位，屬流程文件尚未填寫；棕地本波驗收以交付實作文件為準。見 [系統建置與驗證報告 README](1.docs/系統建置與驗證報告/README.md)。

---

## 八、相關文件快速連結

| 類型 | 連結 |
|------|------|
| 憲章與規範 | [專案憲章](0.standards/1.綠地專案文件/0.專案憲章.md) |
| 架構與使用 | [專案系統架構分析](0.standards/專案系統架構分析.md)、[專案使用說明](0.standards/專案使用說明.md) |
| 開發與交付追溯 | [1.docs 目錄](1.docs/README.md)、[交付實作文件索引](1.docs/交付實作文件/README.md)、[專案架構分析](1.docs/專案架構分析.md)、[角色與權限架構](1.docs/角色與權限管理架構說明.md) |
| 資料庫 | [遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md)、[資料遺失與恢復記錄](1.docs/reviews/2025-01-09-資料庫資料遺失與恢復記錄.md) |
| 驗收與測試 | [驗收報告建立流程](1.docs/驗收報告建立流程.md)、[測試與修復記錄](1.docs/reviews/README.md)、[tests 目錄](tests/README.md) |

---

**最後更新**：2026-05-01

---

## 九、近期更新摘要

### 2026-05（成績中心棕地）

- 部門成績路徑：統計報表／部門績效表現雙頁籤、部門成員批次列印與個人成績單同源、清單 PDF 版面與簽名規格收斂、展開成員表欄寬常數化與寬度控制局部化。詳見 [交付實作文件](1.docs/交付實作文件/README.md)。

### 2026-03～04（節選）

- 成績中心：管理端「成績列印」頁籤、列印前詢問與預覽流程（T13 主線之一）。
- 報到總覽：進行中計畫篩選、統計卡片與清單列印；封存計畫僅檢視。
- 考卷工坊／題庫：全選與批次刪除。
- 考試中心：未報到時「立即報到」引導。
- 系統管理：職務管理權限節點、權限未儲存提示、人員姓名編輯與停用帳號顯示切換。
- 已匯入 `0.standards/倉儲人員.txt`（排除重複後新增 96 筆）。
