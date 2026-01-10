# 教育訓練教材及線上考卷系統

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-Implementing-orange)
![Tech](https://img.shields.io/badge/tech-FastAPI%20%7C%20React%20%7C%20SQLite-green)

**版本 Version**：v1.2.0  
**核准日期 Ratified**：2026-01-02  
**最近修訂 Last Amended**：2026-01-10

---

本專案為一套獨立運行的教育訓練與線上考卷系統，旨在解決企業內部不定期教育訓練、新進員工訓後測驗，並整合 AI 技術自動化出題與批改流程。

## 🚀 核心功能
- **行動優先作答**：支援 iOS/Android 與 Desktop 響應式介面。
- **AI 智慧出題**：上傳 PDF/PPT 教材，AI 自動產出多樣化考卷草稿。
- **免密碼登入**：採用「員工編號 + 圖形驗證碼」機制，簡化使用者操作。
- **QRcode 快速登入**：Admin 產生登入 QRcode，多人可同時使用，仍需輸入員工編號和驗證碼。
- **訓練報到功能**：考試前需先報到，記錄報到時間，統計應到/實到人數。
- **報到 QRcode**：Admin 和訓練計畫管理者可產生報到 QRcode，供用戶掃描快速報到。
- **紅字手寫視覺**：成績單呈現真實手寫批改質感。
- **RBAC 權限管理**：功能導向的權限控制，依角色自定義選單。
- **PDF 報表導出**：產出符合官方樣張格式的成績單。

## ⚡ 快速啟動 (Quick Start)

### 後端服務 (Backend)

```bash
cd backend
export PYTHONPATH=$PYTHONPATH:.
# 加入 --host 0.0.0.0 以允許外部裝置 (手機/平板) 連線
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
<!-- export PYTHONPATH=$PYTHONPATH:. && .venv/bin/python3 -m uvicorn app.main:app --reload   -->

### 前端服務 (Frontend)
```bash
cd frontend
npm run dev
```
> 開發伺服器將執行於 `http://localhost:5173` 或 `http://<您的區網IP>:5173` (已設定 host: 0.0.0.0)

## 🏗️ 專案結構 (SDD 流程)
本專案遵循「規格驅動開發 (SDD)」流程，相關核心規範文檔存放於 `0.standards/`：

### 綠地專案（新功能開發）
1. [**Phase 1: 產品規格 (SPEC)**](0.standards/1.綠地專案文件/1.spec.md) - 定義使用者故事、功能與 UI 需求。
2. [**Phase 2: 技術計畫 (PLAN)**](0.standards/1.綠地專案文件/2.plan.md) - 定義資料庫 Schema、API 契約與技術實作細節。
3. [**Phase 3: 開發任務 (Tasks)**](0.standards/1.綠地專案文件/3.tasks.md) - 詳細的開發進度拆解清單。

### 棕地專案（成績中心功能）
- [**成績中心功能計劃**](0.standards/2.棕地專案/1.成績中心功能計劃.md) - 成績中心功能整體規劃
- [**成績中心開發任務**](0.standards/2.棕地專案/2.成績中心開發任務.md) - 詳細任務清單與進度追蹤（**完成率：40.9%**）
- [**其他實作計劃**](0.standards/2.棕地專案/) - T3.2-T3.3、T4-T10 等實作計劃文件

## 🛠️ 技術堆疊
- **前端**: React 18, Tailwind CSS, Framer Motion, Lucide React
- **後端**: FastAPI (Python), SQLAlchemy, Pydantic, Gemini/GPT API
- **資料庫**: SQLite (本地單機版)
- **報表**: ReportLab (PDF)

## 📁 目錄說明
- `0.standards/`: 存放專案憲章、規格書、技術計畫等規範文件。
- `backend/`: FastAPI 後端專案目錄。
- `frontend/`: React 前端專案目錄。
- `data/`: 存放 SQLite 資料庫檔案與年度教材檔案。

## 📝 開發規範
請參考 [**專案憲章**](0.standards/1.綠地專案文件/0.專案憲章.md) 了解編碼風格、安全性與在地化（zh-TW）之不可協商原則。

## 📈 開發進度

### 已完成功能
- ✅ **T3: 個人成績查詢** - 個人成績總覽、歷史記錄、學習分析（100%）
- ✅ **T4: 成績詳情檢視** - 成績詳情模態框、成績單預覽（100%）
- ✅ **T7: 受課對象與及格分數設定** - 多部門受課對象、自訂及格分數（100%）
- ✅ **T8: 考卷工坊與訓練計畫增強** - 題庫化、匯入功能、UI 優化（100%）
- ✅ **T9: 題目提示功能** - 題目提示顯示與管理（100%）
- ✅ **T10: QRcode 登入與報到功能** - QRcode 快速登入（多人使用）、訓練報到、報到統計、報到 QRcode（100%）

### 進行中功能
- 🔄 **T1: 總覽儀表板優化** - KPI 指標、趨勢圖表、即時狀態（0%）
- 🔄 **T2: 多維度統計分析強化** - 部門/計畫進階分析（0%）
- 🔄 **T5: PDF 報表格式優化** - PDF 匯出優化（0%）
- 🔄 **T6: 整合測試與優化** - 功能測試、效能優化、響應式設計（0%）

詳細進度請參考 [成績中心開發任務清單](0.standards/2.棕地專案/2.成績中心開發任務.md)。
