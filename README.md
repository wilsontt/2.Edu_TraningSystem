# 教育訓練教材及線上考卷系統 (Educational Training & Online Exam System)

![版本](https://img.shields.io/badge/版本-v1.2.0-blue)
![狀態](https://img.shields.io/badge/狀態-穩定版-green)

![React](https://img.shields.io/badge/React-19+-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3+-3776AB?logo=python&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4+-38B2AC?logo=tailwind-css&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7+-646CFF?logo=vite&logoColor=white)

**徽章使用規範**：本專案遵循 [徽章使用規範](0.standards/1.綠地專案文件/徽章使用規範.md)。

**版本**：v1.2.0　**最近修訂**：依專案實際更新

---

## 一、專案概述

本專案為一套獨立運行的**教育訓練與線上考卷系統**（Edu_TrainingSystem），旨在解決企業內部不定期教育訓練、新進員工訓後測驗、報到管理與成績統計等需求，並整合 RBAC 權限、報到 QRcode、成績中心與 PDF 報表等功能。

---

## 二、核心功能

| 功能模組 | 說明 |
|----------|------|
| **行動優先作答** | 支援 iOS/Android 與 Desktop 響應式介面 |
| **免密碼登入** | 員工編號 + 圖形驗證碼，簡化使用者操作 |
| **QRcode 快速登入** | Admin 產生登入 QRcode，多人可共用，仍需輸入員工編號與驗證碼 |
| **訓練計畫管理** | 年度計畫、受課單位/個人授課對象、封存、頁籤（進行中/已過期/已封存）、篩選與排序 |
| **訓練報到與報到 QRcode** | 考試前報到、應到/實到統計、報到 QRcode 產生與掃描 |
| **考卷工坊** | TXT 題目上傳與解析、題庫維護、從題庫匯入題目、教材上傳與預覽 |
| **考試中心** | 依訓練計畫應考、開始考試、作答、提交、即時評分、重考機制 |
| **成績中心** | 總體/部門/計畫統計、個人成績總覽與學習分析、成績詳情、PDF 成績單導出 |
| **RBAC 權限管理** | 功能導向權限、依角色自訂選單、Admin 特權保護 |
| **紅字手寫視覺** | 成績單呈現手寫批改質感 |

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

> ⚠️ **重要**：此命令會建立所有資料表並初始化基礎資料（角色、部門、功能選單等）。若資料庫已存在且有資料，請先備份。詳見 [資料庫遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md)。

### 2. 後端服務

```bash
cd backend
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API 文件：`http://localhost:8000/docs`
- 使用 `--host 0.0.0.0` 以允許手機/平板等外部裝置連線

### 3. 前端服務

```bash
cd frontend
npm install
npm run dev
```

- 開發站：`http://localhost:5173` 或 `http://<區網IP>:5173`（依 Vite 設定）

> **注意**：後端啟動時會自動檢查並建立不存在的資料表，但不會初始化基礎資料。首次使用請先執行上述資料庫初始化。

---

## 四、專案結構與技術堆疊

### 4.1 技術堆疊摘要

| 層級 | 技術 | 用途 |
|------|------|------|
| **前端** | React 19、TypeScript、Vite、Tailwind CSS、React Router、Axios、Lucide React、Framer Motion、Recharts | SPA、響應式 UI、圖表與動畫 |
| **後端** | FastAPI、SQLAlchemy、Pydantic、python-jose、Pillow、ReportLab、python-multipart、qrcode | REST API、ORM、JWT、驗證碼、PDF、檔案上傳、QRcode |
| **資料庫** | SQLite | 單機版資料儲存（`data/education_training.db`） |

### 4.2 目錄結構

| 目錄/檔案 | 說明 |
|-----------|------|
| **0.standards/** | 專案標準、架構分析、使用說明、綠地/棕地規範與計畫 |
| **1.docs/** | 開發紀錄、測試報告、需求與實作計畫、資料庫遷移腳本與指南 |
| **backend/** | FastAPI 應用（`app/`）、路由、模型、服務、遷移；`restore_training_data.py` 為資料恢復腳本（緊急用） |
| **frontend/** | React 應用、頁面與元件、API 封裝、樣式 |
| **data/** | SQLite 資料庫檔、教材與上傳檔案目錄（`education_training.db` 為主資料庫） |

### 4.3 SDD 流程與規範文件

本專案相關核心規範存放於 `0.standards/`：

- **專案說明與入口**：[0.standards/README.md](0.standards/README.md) — 專案概述、快速啟動、目錄與文件索引
- **專案憲章**：[0.standards/1.綠地專案文件/0.專案憲章.md](0.standards/1.綠地專案文件/0.專案憲章.md) — 編碼風格、安全性、正體中文（zh-TW）原則

**綠地專案（新功能開發）**

1. [Phase 1: 產品規格 (SPEC)](0.standards/1.綠地專案文件/1.spec.md) — 使用者故事、功能與 UI 需求
2. [Phase 2: 技術計畫 (PLAN)](0.standards/1.綠地專案文件/2.plan.md) — 資料庫 Schema、API 契約與技術實作
3. [Phase 3: 開發任務 (Tasks)](0.standards/1.綠地專案文件/3.tasks.md) — 開發進度拆解清單

**棕地專案（既有功能增強）**

- [成績中心功能計劃](0.standards/2.棕地專案/1.成績中心功能計劃.md) — 成績中心整體規劃
- [成績中心開發任務](0.standards/2.棕地專案/2.成績中心開發任務.md) — 任務清單與進度追蹤
- [專案架構分析](0.standards/2.棕地專案/0.專案架構分析.md) — API、資料表、檔案結構細節

---

## 五、重要注意事項

### 5.1 資料庫操作安全

1. **備份**：執行任何資料庫操作前請先備份；建議定期備份 `data/education_training.db`，檔名範例：`education_training_YYYYMMDD_HHMMSS.db`。
2. **初始化**：僅在首次使用或資料庫不存在時執行 `init_db()`；若資料庫已有資料，初始化可能導致資料遺失。詳見 [資料庫遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md)。
3. **資料恢復**：若遇資料遺失，可參考 [資料庫資料遺失與恢復記錄](1.docs/reviews/2025-01-09-資料庫資料遺失與恢復記錄.md)，並使用 `backend/restore_training_data.py` 進行恢復。
4. **已知現象**：後端啟動時會自動檢查並建立不存在的資料表，但不會寫入基礎資料；表結構變更時可能需手動遷移，細節見 `1.docs/reviews/`。

---

## 六、開發進度

### 已完成功能

- **T3：個人成績查詢** — 個人成績總覽、歷史記錄、學習分析
- **T4：成績詳情檢視** — 成績詳情模態框、成績單預覽
- **T7：受課對象與及格分數設定** — 多部門受課對象、自訂及格分數
- **T8：考卷工坊與訓練計畫增強** — 題庫化、匯入功能、UI 優化
- **T9：題目提示功能** — 題目提示顯示與管理
- **T10：QRcode 登入與報到功能** — QRcode 快速登入（多人使用）、訓練報到、報到統計、報到 QRcode
- **訓練計畫管理功能增強** — 個人授課對象、頁籤與封存、篩選與排序、操作選單與確認流程

### 進行中／規劃中

- **T1：總覽儀表板優化** — KPI 指標、趨勢圖表、即時狀態
- **T2：多維度統計分析強化** — 部門/計畫進階分析
- **T5：PDF 報表格式優化** — PDF 匯出優化
- **T6：整合測試與優化** — 功能測試、效能優化、響應式設計

詳細進度請參考 [成績中心開發任務清單](0.standards/2.棕地專案/2.成績中心開發任務.md)。

---

## 七、相關文件

### 標準與架構

- [0.standards/README.md](0.standards/README.md) — 專案說明、快速啟動、目錄與文件索引
- [專案系統架構分析](0.standards/專案系統架構分析.md) — 系統架構、流程、資料庫、資料流程、技術堆疊
- [專案使用說明](0.standards/專案使用說明.md) — 使用情境、操作步驟、常見問題

### 開發與維運

- [專案憲章](0.standards/1.綠地專案文件/0.專案憲章.md) — 編碼規範、安全性原則
- [資料庫遷移指南](1.docs/資料庫遷移/MIGRATION_GUIDE.md) — 資料庫遷移與維護說明

### 問題與測試記錄

- [2025-01-09 資料庫資料遺失與恢復記錄](1.docs/reviews/2025-01-09-資料庫資料遺失與恢復記錄.md) — 重要事件記錄
- [測試文件與審查報告目錄](1.docs/reviews/README.md) — 測試與修復記錄一覽

開發記錄詳見 `1.docs/reviews/` 目錄。
