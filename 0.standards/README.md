# 教育訓練教材及線上考卷系統 (Educational Training & Online Exam System)

![版本](https://img.shields.io/badge/版本-v1.2.0-blue) ![狀態](https://img.shields.io/badge/狀態-穩定版-green) ![文件類型](https://img.shields.io/badge/文件類型-專案說明-blue) ![文件狀態](https://img.shields.io/badge/文件-完整-blue)

![React](https://img.shields.io/badge/React-19+-61DAFB?logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white) ![Python](https://img.shields.io/badge/Python-3+-3776AB?logo=python&logoColor=white) ![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4+-38B2AC?logo=tailwind-css&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-7+-646CFF?logo=vite&logoColor=white)

**徽章使用規範**：本專案遵循 [徽章使用規範](1.綠地專案文件/徽章使用規範.md)。

---

## 一、專案概述

本專案為一套獨立運行的**教育訓練與線上考卷系統**，旨在解決企業內部不定期教育訓練、新進員工訓後測驗、報到管理與成績統計等需求，並整合 RBAC 權限、報到 QRcode、成績中心與 PDF 報表等功能。

---

## 二、基本核心功能

| 功能模組 | 說明 |
|----------|------|
| **免密碼登入** | 員工編號 + 圖形驗證碼，降低操作負擔 |
| **QRcode 登入** | Admin 產生登入 QRcode，多人可共用，仍需輸入員工編號與驗證碼 |
| **訓練計畫管理** | 年度訓練計畫、受課單位/個人授課對象、封存、頁籤（進行中/已過期/已封存）、篩選與排序 |
| **報到與報到 QRcode** | 考試前報到、報到時間記錄、應到/實到統計、報到 QRcode 產生 |
| **考卷工坊** | TXT 題目上傳與解析、題庫維護、從題庫匯入題目、教材上傳與預覽 |
| **考試中心** | 依訓練計畫應考、開始考試、作答、提交、即時評分、重考機制 |
| **成績中心** | 總體/部門/計畫統計、個人成績總覽與學習分析、成績詳情、PDF 成績單導出 |
| **系統管理** | 單位、分類、人員、角色、權限、功能清單管理 |
| **RBAC 權限** | 功能導向權限、依角色自訂選單、Admin 特權保護 |

---

## 三、快速啟動 (Quick Start)

### 環境需求

- **後端**：Python 3.x、虛擬環境（建議 `.venv`）
- **前端**：Node.js 18+、npm 或等效套件管理員

### 1. 資料庫初始化（首次使用或資料庫不存在時）

```bash
cd backend
.venv/bin/python3 -c "from app.init_db import init_db; init_db()"
```

> ⚠️ 若資料庫已存在且有資料，請先備份。詳見 [資料庫遷移指南](../1.docs/資料庫遷移/MIGRATION_GUIDE.md)。

### 2. 後端服務

```bash
cd backend
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API 文件：`http://localhost:8000/docs`
- 若需供手機/平板連線，已使用 `--host 0.0.0.0`

### 3. 前端服務

```bash
cd frontend
npm install
npm run dev
```

- 開發站：`http://localhost:5173` 或 `http://<區網IP>:5173`（依 Vite 設定）

---

## 四、專案結構與技術堆疊

### 4.1 目錄結構概觀

```
專案根目錄/
├── 0.standards/           # 專案標準與規範（本目錄）
│   ├── README.md          # 本文件：專案說明、快速啟動、結構與目錄
│   ├── 專案系統架構分析.md  # 系統架構、流程、資料庫、資料流程、技術堆疊
│   ├── 專案使用說明.md     # 操作與使用說明
│   ├── 1.綠地專案文件/     # 憲章、規格、計畫、徽章規範等
│   └── 2.棕地專案/         # 成績中心與既有功能之計畫、任務、修復記錄
├── 1.docs/                # 開發文件、測試記錄、計畫、資料庫遷移
├── backend/               # FastAPI 後端
├── frontend/              # React 前端
├── data/                  # SQLite 資料庫與教材檔案
└── README.md              # 專案根目錄對外說明（可與本文件互補）
```

### 4.2 技術堆疊摘要

| 層級 | 技術 | 用途 |
|------|------|------|
| **前端** | React 19、TypeScript、Vite、Tailwind CSS、React Router、Axios、Lucide React、Framer Motion、Recharts | SPA、響應式 UI、圖表與動畫 |
| **後端** | FastAPI、SQLAlchemy、Pydantic、python-jose、Pillow、ReportLab、python-multipart、qrcode | REST API、ORM、JWT、驗證碼、PDF、檔案上傳、QRcode |
| **資料庫** | SQLite | 單機版資料儲存（`data/education_training.db`） |

更細部架構與 API 設計請見 [專案系統架構分析](專案系統架構分析.md)。

---

## 五、目錄說明

| 目錄/檔案 | 說明 |
|-----------|------|
| **0.standards/** | 專案標準、架構分析、使用說明、綠地/棕地規範與計畫 |
| **0.standards/1.綠地專案文件/** | 專案憲章、規格書、技術計畫、任務、徽章使用規範 |
| **0.standards/2.棕地專案/** | 成績中心、考卷工坊、訓練計畫等既有功能之計畫、任務、架構分析、修復與測試記錄 |
| **1.docs/** | 開發紀錄、測試報告、需求與實作計畫、資料庫遷移腳本與說明 |
| **backend/** | FastAPI 應用（`app/`）、路由、模型、服務、資料庫與遷移 |
| **frontend/** | React 應用、頁面與元件、API 封裝、樣式 |
| **data/** | SQLite 資料庫檔、教材與上傳檔案目錄 |

---

## 六、相關文件索引

### 6.1 本目錄（0.standards）內

- [專案系統架構分析](專案系統架構分析.md) — 系統架構、系統流程、資料庫結構、資料流程、技術堆疊
- [專案使用說明](專案使用說明.md) — 使用情境、操作步驟、常見問題
- [專案憲章](1.綠地專案文件/0.專案憲章.md) — 編碼風格、安全性、正體中文等原則
- [徽章使用規範](1.綠地專案文件/徽章使用規範.md) — README 與文件之徽章格式與運用

### 6.2 開發與維運

- [資料庫遷移指南](../1.docs/資料庫遷移/MIGRATION_GUIDE.md) — 資料庫遷移與結構變更
- [需求分析](../1.docs/plans/教育訓練線上考卷系統%20-%20需求分析.md) — 功能需求與狀態
- [訓練計畫管理功能增強實施計劃](../1.docs/plans/訓練計畫管理功能增強實施計劃.md) — 訓練計畫增強項目與實作對照
- [T13 可行執行計劃](../1.docs/plans/T13_可行執行計劃.md) — 成績中心、考卷工坊、報到總覽、考試中心增修執行計劃

### 6.3 根目錄 README

專案根目錄之 `README.md` 可作為對外簡介，本文件則聚焦於**標準目錄下的專案說明、快速啟動、結構、目錄與文件索引**，兩者搭配使用。

---

**文件版本**：v1.2.0  
**最後修訂**：依專案實際更新  
**維護**：請隨專案變更同步更新版本與連結
