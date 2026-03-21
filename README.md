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
| **成績中心** | 總體／部門／計畫統計、個人成績總覽與學習分析、成績詳情、PDF 成績單導出（紅字手寫視覺）。 |

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
| **1.docs/** | 開發文件索引、架構分析、驗收流程、實作計畫、報告、測試與修復記錄、資料庫遷移 |
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
- [驗收報告建立流程](1.docs/驗收報告建立流程.md) — 任務驗收清單、報告格式與存放規則  

---

## 六、重要注意事項

### 資料庫

1. **備份**：任何資料庫操作前請備份 `data/education_training.db`（建議檔名含時間戳）。  
2. **初始化**：僅在首次或無資料庫時執行 `init_db()`；否則可能覆寫或遺失資料。  
3. **恢復**：可參考 [資料庫資料遺失與恢復記錄](1.docs/reviews/2025-01-09-資料庫資料遺失與恢復記錄.md) 與 `backend/restore_training_data.py`。  
4. **遷移**：表結構變更請依 [資料庫遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md) 處理。  

---

## 七、開發進度摘要

依 [3.tasks.md](0.standards/1.綠地專案文件/3.tasks.md) 與棕地任務：

- **T1～T3**：基礎環境、認證 RBAC、訓練行政（單位／分類／訓練計畫）— 已完成  
- **T4**：考卷工坊 — TXT 解析、教材上傳已完成；AI 出題與草稿編輯器待實作  
- **T5～T7**：考試中心、系統管理與報表、UX 優化 — 已完成  
- **棕地**：QRcode 登入與報到、成績單列印修復、訓練計畫增強、題目提示等 — 依 [成績中心開發任務](0.standards/2.棕地專案/2.成績中心開發任務.md) 與各實作計畫追蹤  

詳細任務狀態與驗收報告見 [3.tasks.md](0.standards/1.綠地專案文件/3.tasks.md)、[1.docs 系統建置與驗證報告](1.docs/系統建置與驗證報告/README.md)。

---

## 八、相關文件快速連結

| 類型 | 連結 |
|------|------|
| 憲章與規範 | [專案憲章](0.standards/1.綠地專案文件/0.專案憲章.md) |
| 架構與使用 | [專案系統架構分析](0.standards/專案系統架構分析.md)、[專案使用說明](0.standards/專案使用說明.md) |
| 開發文件 | [1.docs 目錄](1.docs/README.md)、[專案架構分析](1.docs/專案架構分析.md)、[角色與權限架構](1.docs/角色與權限管理架構說明.md) |
| 資料庫 | [遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md)、[資料遺失與恢復記錄](1.docs/reviews/2025-01-09-資料庫資料遺失與恢復記錄.md) |
| 驗收與測試 | [驗收報告建立流程](1.docs/驗收報告建立流程.md)、[測試與修復記錄](1.docs/reviews/README.md) |

---

**最後更新**：2026-03-20

---

## 九、近期更新（2026-03）

### 功能修正

- **報到總覽**：具 `menu:attendance-overview` 之角色可呼叫訓練計畫清單／報到統計／未到原因 API（與 `menu:plan` 二擇一即可）；已封存計畫禁止更新未到原因（後端 400、前端隱藏編輯）。
- 系統管理新增「職務管理」獨立權限節點，權限管理可獨立勾選。
- 權限管理切換角色的未儲存提示，新增「儲存變更」選項（先儲存再切換）。
- 人員管理編輯功能支援修改姓名。
- 人員管理新增「顯示/隱藏停用帳號」按鈕，且預設隱藏停用帳號。

### 資料處理

- 已匯入 `0.standards/倉儲人員.txt`（100 筆），排除重複 `emp_id` 4 筆後新增 96 筆。
