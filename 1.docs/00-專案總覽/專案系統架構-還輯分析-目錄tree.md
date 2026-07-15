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
| **認證** | JWT + 圖形驗證碼 + AD（棕地） | 員工免密登入；IT 管理者 AD／OTP／break-glass；`is_trainee` 隔離管理帳號 |
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

### 3.4 教材與備援模組（棕地 2026-06～07）
- **material_types** / **material_file_formats**：教材類型與允許副檔名主檔（SSOT）。
- **teaching_material_sets** / **teaching_material_files** / **teaching_material_set_plans**：現行套組（一標題多檔、0～N 計畫綁定）；實體檔於 NAS（`MATERIALS_ROOT`）。
- **teaching_materials**：Wave1 目錄卡（遺留；已遷移至套組）。
- **backup_schedule_config** / **backup_records**：SQLite 排程備份設定與執行紀錄。
- **file_transfer_audit_logs**：考卷 TXT、教材上傳／下載稽核。
- **admin_login_otps**：AD 斷線時 Email OTP。

---

## 四、 後端 API 串接方法 (API Integration)

### 4.1 基礎配置
- **Base URL**: `http://localhost:8000/api`
- **認證方式**: Header 攜帶 `Authorization: Bearer <JWT_TOKEN>`。

### 4.2 核心 API 端點
| 模組 | 前綴 | 主要操作 |
|------|------|----------|
| **認證** | `/auth` | `/captcha`, `/login`, `/login/admin`, `/login/local`, `/me` |
| **系統管理** | `/admin` | 部門、人員、角色、功能、權限的 CRUD |
| **訓練計畫** | `/training` | 計畫建立、更新、報到管理、報到總覽 |
| **考卷工坊** | `/admin/exams` | TXT 上傳解析（NAS）、題目編輯 |
| **題庫** | `/admin/question-bank` | 題庫搜尋、批次匯入至計畫 |
| **教材庫** | `/admin/teaching-materials`（含 `/sets`） | 套組上傳／下載、NAS session、類型／格式主檔 |
| **考試中心** | `/exam` | `/my_exams`, `/start/{id}`, `/submit/{id}`, 報到 |
| **報表中心** | `/admin/reports` | 統計、部門績效、批次列印、PDF |
| **排程備份** | `/admin/backup` | 設定、立即備份、紀錄 |

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
│   │   ├── components/     # UI 元件 (admin, exam, personal, teaching, attendance)
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
| `1.docs/02-棕地專案/棕地功能總覽.md` | 棕地波次（2026-04～07）功能與程式落點 |
| `1.docs/02-棕地專案/交付實作文件/README.md` | 棕地任務單與結案索引 |

---
**最後更新時間**：2026-07-15（教材套組 Wave2）
