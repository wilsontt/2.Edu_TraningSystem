# 線上教育訓練系統 - 系統架構、邏輯分析與目錄結構

![版本](https://img.shields.io/badge/版本-v1.2.0-blue) ![狀態](https://img.shields.io/badge/狀態-穩定版-green)

本文件整合了專案的技術架構、核心商業邏輯、資料庫結構、API 串接方法以及目錄組織結構，旨在提供開發人員與維運人員全方位的系統概覽。

---

## 一、 系統架構 (System Architecture)

### 1.1 技術堆疊 (Tech Stack)
| 層級 | 技術 | 說明 |
|------|------|------|
| **前端** | React 19, TypeScript, Vite | 採用現代 SPA 架構，Tailwind CSS 4 負責樣式，Framer Motion 負責動畫。 |
| **後端** | FastAPI (Python 3.x) | RESTful API，使用 SQLAlchemy ORM，Pydantic 進行資料驗證。 |
| **資料庫** | SQLite | 位於 `data/education_training.db`，適合中小型企業內部使用。 |
| **認證** | JWT + 圖形驗證碼 | 免密碼登入機制（員工編號 + 驗證碼），支援 QRcode 快速登入。 |
| **報表** | ReportLab | 用於生成 PDF 成績單。 |

### 1.2 認證與授權流程
- **登入**：使用者輸入員工編號，並通過後端 Pillow 生成的圖形驗證碼校驗，成功後簽發 JWT。
- **權限控制 (RBAC)**：
  - 核心表：`roles`, `system_functions`, `role_functions`。
  - 功能代碼（如 `menu:exam`, `btn:export`）對應選單與操作權限。
  - `Admin` 角色具備全域特權，部分核心配置（如 Admin 角色本身）受系統保護不可刪改。

---

## 二、 核心商業邏輯 (Business Logic)

### 2.1 訓練與計畫管理
- **層級化管理**：訓練類別採「大項目 → 細項目」兩層式管理。
- **計畫發佈**：訓練計畫可指定「受課單位（部門）」或「個人授課對象」，支援年度與日期範圍篩選。
- **封存機制**：計畫完成或過期後可封存，封存後在報到總覽等功能中僅供檢視。

### 2.2 考卷工坊 (Exam Studio)
- **TXT 題目解析**：專有的解析邏輯支援快速上傳題目，自動識別單選、多選與是非題。
- **題庫同步**：上傳至計畫的題目會自動同步至全域題庫 (`question_bank`)，達成題目資源共享。

### 2.3 考試與評分流程
- **報到 (Attendance)**：考試前需進行報到，支援 QRcode 掃描報到。
- **線上作答**：前端具備進度快取、計時器、以及防誤觸離開機制。
- **即時評分**：提交後後端即時計算分數，判斷是否及格，並寫入 `exam_records` 與 `exam_details`。
- **重考邏輯**：未及格者可進行重考，系統會更新作答次數並記錄最新成績。

---

## 三、 資料庫結構 (Database Schema)

系統採用 SQLite，核心資料表依模組劃分如下：

### 3.1 組織架構模組 (Organization)
- **departments**：儲存部門/單位名稱。
- **users**：使用者資訊，關鍵欄位為 `emp_id` (PK), `dept_id` (FK), `role_id` (FK)。
- **roles** & **system_functions**：RBAC 權限核心，透過 `role_functions` 中間表關聯。

### 3.2 訓練管理模組 (Training)
- **main_categories** & **sub_categories**：訓練課程的兩層式分類。
- **training_plans**：訓練計畫核心，紀錄日期、及格分數、是否封存等。
- **plan_target_departments** & **plan_target_users**：定義計畫的受課對象（多對多關係）。

### 3.3 題目與考試模組 (Exam)
- **questions**：綁定於特定計畫的題目，包含 `content`, `question_type`, `options` (JSON), `answer`。
- **question_bank**：全域題庫，支援跨計畫複用題目。
- **exam_records**：考試總紀錄（分數、是否通過、作答次數）。
- **exam_details**：單次考試中每一題的作答狀況。
- **attendance_records**：員工報到時間紀錄。

---

## 四、 後端 API 串接方法 (API Integration)

### 4.1 基礎配置
- **Base URL**: `http://localhost:8000/api`
- **認證方式**: Header 攜帶 `Authorization: Bearer <JWT_TOKEN>`。

### 4.2 核心 API 端點
| 模組 | 前綴 | 主要操作 |
|------|------|----------|
| **認證** | `/auth` | `/captcha` (取得驗證碼), `/login` (登入), `/me` (取得目前權限) |
| **系統管理** | `/admin` | 部門、人員、角色、功能、權限的 CRUD |
| **訓練計畫** | `/training` | 計畫建立、更新、報到管理 |
| **考卷工坊** | `/admin/exams` | TXT 上傳解析、題目編輯、教材管理 |
| **題庫** | `/admin/question-bank` | 題庫搜尋、批次匯入至計畫 |
| **考試中心** | `/exam` | `/my_exams` (我的考試), `/start/{id}` (開始), `/submit/{id}` (提交) |
| **報表中心** | `/admin/reports` | 統計數據、部門績效、PDF 成績單匯出 |

### 4.3 調用規範
1. **資料格式**：所有請求與回應均使用 JSON 格式，遵循 Pydantic Schema 定義。
2. **錯誤處理**：後端返回標準 HTTP 狀態碼（如 401 未認證, 403 無權限, 422 格式錯誤）。
3. **前端封裝**：前端使用 Axios Interceptors 自動附加 Token 並處理過期重導向。

---

## 五、 目錄架構 (Directory Tree)

```text
/
├── 1.docs/                 # 全專案文件中心 (SDD 驅動)
│   ├── 00-專案總覽/         # 跨階段架構、權限、資料庫結構與遷移、驗收流程
│   ├── 01-綠地專案/         # 新功能規格 (Spec)、計畫 (Plan)、任務 (Tasks)、憲章
│   ├── 02-棕地專案/         # 既有功能優化 (T 系列計畫、開發/修復記錄、交付實作文件、驗證報告)
│   ├── 系統測試/            # 使用者驗證測試 (UAT) 文件
│   └── logs/               # 開發期日誌
├── backend/                # FastAPI 後端應用
│   ├── app/                # 核心代碼
│   │   ├── routers/        # API 端點 (auth, admin, training, exam...)
│   │   ├── services/       # 業務邏輯 (如 parser.py 解析器)
│   │   ├── models.py       # SQLAlchemy 資料模型
│   │   └── schemas.py      # Pydantic 資料結構
│   └── data/               # 資料庫連結與教材存放 (部分連結至根目錄 data)
├── frontend/               # React 前端應用
│   ├── src/
│   │   ├── components/     # UI 元件 (分模組存放：admin, exam, personal)
│   │   ├── hooks/          # 自定義 Hooks (如 useExamProgress)
│   │   └── api.ts          # Axios 配置與通訊封裝
│   └── public/             # 靜態資源 (Logo 等)
├── data/                   # SQLite 資料庫與教材上傳目錄 (備份重點)
└── tests/                  # 測試腳本與自動化檢驗工具
```

---

## 六、 關鍵開發連結

| 文件 | 描述 |
|------|------|
| `README.md` | 專案快速啟動與現況摘要 |
| `1.docs/00-專案總覽/專案系統架構分析.md` | 詳細的系統流程圖與資料流程 |
| `1.docs/00-專案總覽/資料庫結構分析/education_training_db_結構分析.md` | 資料表全欄位與關聯定義 |
| `1.docs/02-棕地專案/交付實作文件/README.md` | 棕地迭代 (2026-04~05) 的詳細任務清單 |

---
**最後更新時間**：2026-05-01
