# education_training.db 資料庫結構分析

## 1. 目的

記錄專案根目錄 `data/education_training.db`（SQLite）之資料表、欄位定義、索引與表間關聯，供開發、遷移與權限設計對照使用。

## 2. 範圍

- **涵蓋**：`sqlite_master` 中所有 `type='table'` 之使用者資料表（不含 `sqlite_%` 內建表）。
- **不含**：執行時期資料內容、應用程式層商業規則（僅就 schema 與宣告式外鍵描述）。
- **分析基準檔**：`data/education_training.db`（分析產出時點以本文件「參考」一節為準）。

## 3. 權責

- **維護**：架構或遷移變更時應更新本文件與實際 DB 一致。
- **單一真相**：以實際 `.db` 檔與 `backend/app/models.py` 對照為準；若二者不一致，以執行環境 DB 為準並應追蹤差異原因。

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| **PK** | Primary Key，主鍵。 |
| **FK** | Foreign Key，SQLite 宣告式外鍵（需連線啟用 foreign_keys 時強制）。 |
| **M:N** | 多對多，通常以關聯表兩欄分別指向兩實體。 |
| **scope_type** | 角色可查視之部門範圍類型；應用程式慣用值見 `RoleDepartmentScope` 註解：`all` \| `department` \| `self`（預設 `self`）。 |
| **長度** | 字元型：schema 有 `VARCHAR(n)` 者表列 `n`（字元數，SQLite 仍以 TEXT 儲存）；未宣告者標「未宣告」。`TEXT` 為「未固定上限」（SQLite 單欄約 1GB 上限）。整數、日期時間、布林標「—」。 |

## 5. 作業內容

### 5.1 資料表一覽（依名稱排序）

共 **29** 張表（英文表名＋中文名稱；含 3 張多對多關聯表）：

| 資料表（英文） | 中文名稱 |
|----------------|----------|
| `admin_login_otps` | 管理帳號 Email OTP（AD 斷線備援） |
| `attendance_absence_reasons` | 缺席／未到原因登記 |
| `attendance_records` | 簽到紀錄 |
| `backup_records` | 排程／手動備份執行紀錄 |
| `backup_schedule_config` | 排程備份設定（單例） |
| `departments` | 部門 |
| `exam_details` | 考卷作答明細 |
| `exam_history` | 考試成績／提交歷程快照 |
| `exam_records` | 考試主紀錄 |
| `file_transfer_audit_logs` | 檔案傳輸稽核（考卷 TXT、教材） |
| `job_titles` | 職務 |
| `login_tokens` | 登入 Token（QR 歷史；現 QR 方案 A 多為固定 URL） |
| `main_categories` | 訓練主分類 |
| `material_file_formats` | 教材允許副檔名主檔 |
| `material_types` | 教材類型主檔 |
| `plan_target_departments` | 訓練計畫對象部門（多對多） |
| `plan_target_users` | 訓練計畫對象人員（多對多） |
| `question_bank` | 共用題庫 |
| `questions` | 訓練計畫考題 |
| `role_department_scope_depts` | 角色可查視部門範圍—部門明細 |
| `role_department_scope_map` | 角色可查視部門範圍—範圍類型（ORM 使用） |
| `role_department_scopes` | 角色可查視部門範圍—範圍類型（遺留表，與 scope_map 同構） |
| `role_functions` | 角色與系統功能關聯（多對多） |
| `roles` | 角色 |
| `sub_categories` | 訓練子分類 |
| `system_functions` | 系統功能（選單／按鈕權限樹） |
| `teaching_materials` | 教材目錄卡（實體檔於 NAS） |
| `training_plans` | 訓練／考試計畫 |
| `users` | 使用者（帳號） |

### 5.2 實體關係圖（ERD）

以下以 Mermaid `erDiagram` 表達主要 FK 關聯（與 SQLite 宣告一致）。

```mermaid
erDiagram
    departments ||--o{ users : "dept_id"
    roles ||--o{ users : "role_id"
    job_titles ||--o{ users : "job_title_id"

    roles ||--o{ role_functions : "role_id"
    system_functions ||--o{ role_functions : "function_id"
    system_functions ||--o{ system_functions : "parent_id"

    roles ||--o| role_department_scopes : "role_id"
    roles ||--o| role_department_scope_map : "role_id"
    roles ||--o{ role_department_scope_depts : "role_id"
    departments ||--o{ role_department_scope_depts : "dept_id"

    main_categories ||--o{ sub_categories : "main_id"
    sub_categories ||--o{ training_plans : "sub_category_id"
    departments ||--o{ training_plans : "dept_id"

    training_plans ||--o{ plan_target_departments : "plan_id"
    departments ||--o{ plan_target_departments : "dept_id"
    training_plans ||--o{ plan_target_users : "plan_id"
    users ||--o{ plan_target_users : "emp_id"

    training_plans ||--o{ questions : "plan_id"
    training_plans ||--o{ exam_records : "plan_id"
    users ||--o{ exam_records : "emp_id"
    exam_records ||--o{ exam_details : "record_id"
    questions ||--o{ exam_details : "question_id"
    exam_records ||--o{ exam_history : "record_id"
    exam_records ||--o{ exam_retake_authorizations : "record_id"
    exam_history ||--o| exam_retake_authorizations : "consumed_history_id"

    users ||--o{ attendance_records : "emp_id"
    training_plans ||--o{ attendance_records : "plan_id"

    users ||--o{ login_tokens : "created_by"

    training_plans ||--o{ attendance_absence_reasons : "plan_id"
    users ||--o{ attendance_absence_reasons : "emp_id"
    users ||--o{ attendance_absence_reasons : "recorded_by"

    material_types ||--o{ teaching_materials : "material_type_id"
    training_plans ||--o{ teaching_materials : "plan_id"
    teaching_materials ||--o| teaching_materials : "replaced_by_id"
```

> **棕地增補（2026-06～07）**：`material_types`、`material_file_formats`、`teaching_materials`、`backup_schedule_config`、`backup_records`、`admin_login_otps`、`file_transfer_audit_logs`；`users` 擴充 AD／受訓隔離欄位。完整欄位見 **5.3** 各表與 `backend/app/models.py`。

> **說明**：`question_bank` 在 schema 上為獨立題庫，**未**宣告 FK 至 `users`；`created_by` 語意上常對應 `users.emp_id`，但 DB 層未強制。

### 5.3 各資料表欄位結構

欄位表欄位：`欄位`、`中文說明`、`類型`、`長度`、`NOT NULL`、`PK`、`預設`、`FK / 備註`。

---

#### `attendance_absence_reasons` — 訓練計畫缺席／未到原因登記

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| plan_id | 訓練計畫 ID | INTEGER | — | 是 | — | — | → `training_plans.id` |
| emp_id | 未到／缺席員工工號 | VARCHAR | 未宣告 | 是 | — | — | → `users.emp_id` |
| reason_code | 原因代碼 | VARCHAR | 50 | 是 | — | — | — |
| reason_text | 原因補充說明 | VARCHAR | 500 | 否 | — | — | — |
| recorded_by | 登錄人員工號 | VARCHAR | 未宣告 | 是 | — | — | → `users.emp_id` |
| recorded_at | 登錄時間 | DATETIME | — | 否 | — | — | — |

**索引**：`ix_attendance_absence_reasons_id`（`id`）。

---

#### `attendance_records` — 簽到紀錄

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| emp_id | 簽到員工工號 | VARCHAR | 未宣告 | 否 | — | — | → `users.emp_id` |
| plan_id | 訓練計畫 ID | INTEGER | — | 否 | — | — | → `training_plans.id` |
| checkin_time | 簽到時間 | DATETIME | — | 否 | — | — | — |
| ip_address | 簽到來源 IP | VARCHAR | 未宣告 | 否 | — | — | — |

**索引**：`ix_attendance_records_id`（`id`）。

---

#### `departments` — 部門

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 部門 ID | INTEGER | — | 是 | 是 | — | — |
| name | 部門名稱 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE（見索引） |

**索引**：`ix_departments_id`（`id`）、`ix_departments_name`（UNIQUE，`name`）。

---

#### `exam_details` — 單次考卷作答明細

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| record_id | 考試主紀錄 ID | INTEGER | — | 否 | — | — | → `exam_records.id` |
| question_id | 考題 ID | INTEGER | — | 否 | — | — | → `questions.id` |
| user_answer | 使用者作答內容 | VARCHAR | 未宣告 | 否 | — | — | — |
| is_correct | 是否答對 | BOOLEAN | — | 否 | — | — | — |

**索引**：`ix_exam_details_id`（`id`）。

---

#### `exam_history` — 成績／提交歷程快照（關聯單一 `exam_records`）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| record_id | 考試主紀錄 ID | INTEGER | — | 否 | — | — | → `exam_records.id` |
| submit_time | 提交時間 | DATETIME | — | 否 | — | — | — |
| total_score | 總分 | INTEGER | — | 否 | — | — | — |
| is_passed | 是否及格 | BOOLEAN | — | 否 | — | — | — |
| details | 明細快照（JSON 或文字） | TEXT | 未固定上限 | 否 | — | — | 可能為彙總 JSON 或文字 |

**索引**：`ix_exam_history_id`（`id`）。

---

#### `exam_records` — 考試主紀錄（使用者 × 計畫）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| emp_id | 應考員工工號 | VARCHAR | 未宣告 | 否 | — | — | → `users.emp_id` |
| plan_id | 訓練計畫 ID | INTEGER | — | 否 | — | — | → `training_plans.id` |
| total_score | 總分 | INTEGER | — | 否 | — | — | — |
| is_passed | 是否及格 | BOOLEAN | — | 否 | — | — | — |
| start_time | 開始作答時間 | DATETIME | — | 否 | — | — | — |
| submit_time | 提交時間 | DATETIME | — | 否 | — | — | — |
| attempts | 作答次數／重考次數 | INTEGER | — | 否 | — | — | — |
| retake_authorized | 是否已被授權重考（待使用） | BOOLEAN | — | 否 | — | False | 授權時設為 True；學員提交後自動清除為 False |

**索引**：`ix_exam_records_id`（`id`）。

---

#### `exam_retake_authorizations` — 授權重考稽核日誌

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| record_id | 考試主紀錄 ID | INTEGER | — | 是 | — | — | → `exam_records.id` |
| authorized_by | 授權者員工編號 | VARCHAR | 未宣告 | 是 | — | — | → `users.emp_id` |
| authorized_at | 授權時間 | DATETIME | — | 是 | — | — | 臺北時間（naive） |
| reason | 授權原因 | TEXT | — | 是 | — | — | 最多 500 字 |
| consumed_at | 重考提交時間（授權被使用） | DATETIME | — | 否 | — | NULL | 學員提交後填入 |
| consumed_history_id | 對應交卷歷程 ID | INTEGER | — | 否 | — | NULL | → `exam_history.id`（第 N＋1 次） |
| revoked_at | 撤銷時間 | DATETIME | — | 否 | — | NULL | 管理員撤銷授權時填入 |
| revoked_by | 撤銷者員工編號 | VARCHAR | 未宣告 | 否 | — | NULL | — |

**業務邏輯**：每次授權新增一筆；`consumed_at` 有值表示授權已被使用；`consumed_history_id` 綁定該次交卷的 `exam_history.id`；`revoked_at` 有值表示被撤銷。同時 `consumed_at` 和 `revoked_at` 均為 NULL 表示「待使用」授權。

**索引**：`idx_retake_auth_record_id`（`record_id`）、`idx_retake_auth_consumed_history`（`consumed_history_id`）。

---

#### `job_titles` — 職務名稱

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 職務 ID | INTEGER | — | 是 | 是 | — | — |
| name | 職務名稱 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE |
| sort_order | 排序權重 | INTEGER | — | 否 | — | — | — |

**索引**：`ix_job_titles_id`、`ix_job_titles_name`（UNIQUE）。

---

#### `login_tokens` — 登入用一次性／限時 Token

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 流水號 | INTEGER | — | 是 | 是 | — | — |
| token | Token 字串 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE |
| created_by | 建立者工號 | VARCHAR | 未宣告 | 否 | — | — | → `users.emp_id` |
| created_at | 建立時間 | DATETIME | — | 否 | — | — | — |
| expires_at | 過期時間 | DATETIME | — | 否 | — | — | — |
| used_at | 首次使用時間 | DATETIME | — | 否 | — | — | — |
| is_used | 是否已使用 | BOOLEAN | — | 否 | — | — | — |

**索引**：`ix_login_tokens_id`、`ix_login_tokens_token`（UNIQUE）。

---

#### `main_categories` — 訓練主分類

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 主分類 ID | INTEGER | — | 是 | 是 | — | — |
| name | 主分類名稱 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE 約束（表層級） |

**索引**：`ix_main_categories_id`（`id`）。

---

#### `plan_target_departments` — 計畫對象部門（M:N）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| plan_id | 訓練計畫 ID | INTEGER | — | 否 | — | — | → `training_plans.id` |
| dept_id | 部門 ID | INTEGER | — | 否 | — | — | → `departments.id` |

無複合主鍵宣告；實務上應避免重複 `(plan_id, dept_id)`。

---

#### `plan_target_users` — 計畫對象人員（M:N）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| plan_id | 訓練計畫 ID | INTEGER | — | 否 | — | — | → `training_plans.id` |
| emp_id | 受課對象工號 | VARCHAR | 未宣告 | 否 | — | — | → `users.emp_id` |

無複合主鍵宣告；實務上應避免重複 `(plan_id, emp_id)`。

---

#### `question_bank` — 共用題庫

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 題目 ID | INTEGER | — | 是 | 是 | — | — |
| content | 題幹 | TEXT | 未固定上限 | 是 | — | — | — |
| question_type | 題型 | VARCHAR | 未宣告 | 是 | — | — | — |
| options | 選項（序列化） | TEXT | 未固定上限 | 否 | — | — | — |
| answer | 正解 | VARCHAR | 未宣告 | 是 | — | — | — |
| tags | 標籤 | TEXT | 未固定上限 | 否 | — | — | — |
| hint | 提示 | TEXT | 未固定上限 | 否 | — | — | — |
| created_by | 建立者工號 | VARCHAR | 未宣告 | 否 | — | — | **無 FK**（語意可為工號） |
| created_at | 建立時間 | DATETIME | — | 否 | — | — | — |
| level | 難度等級 | VARCHAR | 20 | 否 | — | — | — |

**索引**：`ix_question_bank_id`（`id`）。

---

#### `questions` — 某訓練計畫底下的考題

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 考題 ID | INTEGER | — | 是 | 是 | — | — |
| plan_id | 訓練計畫 ID | INTEGER | — | 否 | — | — | → `training_plans.id` |
| content | 題幹 | TEXT | 未固定上限 | 否 | — | — | — |
| question_type | 題型 | VARCHAR | 未宣告 | 否 | — | — | — |
| options | 選項（序列化） | TEXT | 未固定上限 | 否 | — | — | — |
| answer | 正解 | VARCHAR | 未宣告 | 否 | — | — | — |
| points | 配分 | INTEGER | — | 否 | — | — | — |
| hint | 提示 | TEXT | 未固定上限 | 否 | — | — | — |
| level | 難度等級 | VARCHAR | 20 | 否 | — | — | — |

**索引**：`ix_questions_id`（`id`）。

---

#### `role_department_scope_depts` — 角色部門範圍：指定多部門時之明細

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| role_id | 角色 ID | INTEGER | — | 是 | 是（複合） | — | → `roles.id` |
| dept_id | 可查視部門 ID | INTEGER | — | 是 | 是（複合） | — | → `departments.id` |

**索引**：無額外命名索引（PK 即複合主鍵）。

---

#### `role_department_scope_map` — 角色部門範圍類型（ORM：`RoleDepartmentScope`）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| role_id | 角色 ID | INTEGER | — | 是 | 是 | — | → `roles.id` |
| scope_type | 範圍類型 | VARCHAR | 未宣告 | 是 | — | — | 如 `all`／`department`／`self` |

**索引**：無額外命名索引。

---

#### `role_department_scopes` — 與 `role_department_scope_map` 結構相同之表

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| role_id | 角色 ID | INTEGER | — | 是 | 是 | — | → `roles.id` |
| scope_type | 範圍類型 | VARCHAR | 未宣告 | 是 | — | — | 同上 |

**注意**：`backend/app/models.py` 中 **僅** 對應 `role_department_scope_map`（類別 `RoleDepartmentScope`）。本表可能是歷史遷移遺留；應用程式若未讀寫此表，與 `scope_map` 並存時需釐清單一資料來源。

---

#### `role_functions` — 角色與系統功能 M:N

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| role_id | 角色 ID | INTEGER | — | 否 | — | — | → `roles.id` |
| function_id | 系統功能 ID | INTEGER | — | 否 | — | — | → `system_functions.id` |

無複合主鍵宣告。

---

#### `roles` — 角色

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 角色 ID | INTEGER | — | 是 | 是 | — | — |
| name | 角色名稱 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE |

**索引**：`ix_roles_id`、`ix_roles_name`（UNIQUE）。

---

#### `sub_categories` — 訓練子分類

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 子分類 ID | INTEGER | — | 是 | 是 | — | — |
| main_id | 所屬主分類 ID | INTEGER | — | 否 | — | — | → `main_categories.id` |
| name | 子分類名稱 | VARCHAR | 未宣告 | 否 | — | — | — |

**索引**：`ix_sub_categories_id`（`id`）。

---

#### `system_functions` — 系統功能樹（選單／按鈕權限）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 功能 ID | INTEGER | — | 是 | 是 | — | — |
| name | 顯示名稱 | VARCHAR | 未宣告 | 否 | — | — | — |
| code | 功能代碼 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE，如 `menu:exam` |
| parent_id | 父功能 ID | INTEGER | — | 否 | — | — | → `system_functions.id`（自關聯） |
| path | 路由／路徑 | VARCHAR | 未宣告 | 否 | — | — | — |

**索引**：`ix_system_functions_id`、`ix_system_functions_code`（UNIQUE）。

---

#### `training_plans` — 訓練／考試計畫

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| id | 計畫 ID | INTEGER | — | 是 | 是 | — | — |
| sub_category_id | 子分類 ID | INTEGER | — | 否 | — | — | → `sub_categories.id` |
| dept_id | 所屬／開課單位 ID | INTEGER | — | 否 | — | — | → `departments.id` |
| title | 計畫標題 | VARCHAR | 未宣告 | 否 | — | — | — |
| training_date | 訓練／考試開始日 | DATE | — | 否 | — | — | — |
| end_date | 結束日 | DATE | — | 否 | — | — | — |
| year | 年度（字串） | VARCHAR | 未宣告 | 否 | — | — | — |
| timer_enabled | 是否啟用計時 | BOOLEAN | — | 否 | — | — | — |
| time_limit | 作答時間上限（分鐘等，依應用） | INTEGER | — | 否 | — | — | — |
| passing_score | 及格分數 | INTEGER | — | 否 | — | — | — |
| expected_attendance | 預期應到人數 | INTEGER | — | 否 | — | — | — |
| is_archived | 是否已封存 | INTEGER | — | 否 | `0` | 0／1 旗標 |

**索引**：`ix_training_plans_id`（`id`）。

---

#### `users` — 使用者（主鍵為工號）

| 欄位 | 中文說明 | 類型 | 長度 | NOT NULL | PK | 預設 | FK / 備註 |
|------|----------|------|------|----------|----|------|-----------|
| emp_id | 員工編號（帳號） | VARCHAR | 未宣告 | 是 | 是 | — | 主鍵 |
| name | 姓名 | VARCHAR | 未宣告 | 否 | — | — | — |
| dept_id | 部門 ID | INTEGER | — | 否 | — | — | → `departments.id` |
| role_id | 角色 ID | INTEGER | — | 否 | — | — | → `roles.id` |
| status | 帳號狀態 | VARCHAR | 未宣告 | 否 | — | — | 應用預設常為 `active` |
| job_title_id | 職務 ID | INTEGER | — | 否 | — | — | → `job_titles.id` |
| auth_source | 認證來源 | VARCHAR | 未宣告 | 否 | — | `local` | `local`／`ad`／`email_fallback` |
| ad_username | AD 登入帳號 | VARCHAR | 未宣告 | 否 | — | — | UNIQUE |
| email | 電子郵件 | VARCHAR | 未宣告 | 否 | — | — | JIT 自 AD 同步；OTP 備援用 |
| email_verified_at | Email 驗證時間 | DATETIME | — | 否 | — | — | AD 登入時更新 |
| is_trainee | 是否受訓者 | BOOLEAN | — | 否 | — | `1` | `0`＝管理帳號，排除考試／統計 |
| last_login_at | 最後登入時間 | DATETIME | — | 否 | — | — | — |
| password_hash | 密碼雜湊 | VARCHAR | 未宣告 | 否 | — | — | 僅 break-glass 帳號 |
| password_changed_at | 密碼變更時間 | DATETIME | — | 否 | — | — | ISO 27001 政策 |
| must_change_password | 須強制改密 | BOOLEAN | — | 否 | — | `0` | — |
| failed_login_count | 連續登入失敗次數 | INTEGER | — | 否 | — | `0` | break-glass 鎖定用 |
| locked_until | 帳號鎖定截止 | DATETIME | — | 否 | — | — | — |
| is_protected | 受保護帳號 | BOOLEAN | — | 否 | — | `0` | break-glass，禁止刪除／停用 |

**索引**：`ix_users_emp_id`（`emp_id`）。

---

#### `admin_login_otps` — 管理帳號 Email OTP

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 流水號 | INTEGER | 是 | 是 | — |
| emp_id | 員工編號 | VARCHAR | 否 | — | 索引 |
| otp_hash | OTP 雜湊 | VARCHAR | 否 | — | bcrypt，不存明文 |
| expires_at | 過期時間 | DATETIME | 否 | — | 索引 |
| attempt_count | 嘗試次數 | INTEGER | 否 | — | — |
| created_at | 建立時間 | DATETIME | 否 | — | — |
| used_at | 使用時間 | DATETIME | 否 | — | — |

---

#### `backup_schedule_config` — 排程備份設定（單例 id=1）

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 固定為 1 | INTEGER | 是 | 是 | 單例 |
| enabled | 是否啟用 | BOOLEAN | 否 | — | — |
| frequency | 頻率 | VARCHAR | 否 | — | `daily`／`weekly` |
| time_of_day | 執行時刻 | VARCHAR | 否 | — | HH:mm |
| weekday | 星期幾 | INTEGER | 否 | — | weekly 時 0=週一 |
| retention_count | 保留份數 | INTEGER | 否 | — | — |
| destination | NAS 備份路徑 | VARCHAR | 否 | — | 空則用 `BACKUP_ROOT` |
| backup_nas_username | 備份 NAS 帳號 | VARCHAR | 否 | — | — |
| backup_nas_password_encrypted | 備份 NAS 密碼 | TEXT | 否 | — | Fernet 加密 |
| updated_at | 更新時間 | DATETIME | 否 | — | — |

---

#### `backup_records` — 備份執行紀錄

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 流水號 | INTEGER | 是 | 是 | — |
| filename | 備份檔名 | VARCHAR | 否 | — | — |
| created_at | 執行時間 | DATETIME | 否 | — | 索引 |
| size_bytes | 檔案大小 | INTEGER | 否 | — | — |
| status | 狀態 | VARCHAR | 否 | — | `success`／`failed` |
| message | 訊息 | VARCHAR | 否 | — | — |
| duration_ms | 耗時毫秒 | INTEGER | 否 | — | — |

---

#### `file_transfer_audit_logs` — 檔案傳輸稽核

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 流水號 | INTEGER | 是 | 是 | — |
| created_at | 時間 | DATETIME | 否 | — | 索引 |
| emp_id | 操作者工號 | VARCHAR | 否 | — | 索引 |
| client_ip | 來源 IP | VARCHAR | 否 | — | — |
| nas_username | NAS 帳號 | VARCHAR | 否 | — | interactive 或 `service` |
| action | 動作 | VARCHAR | 否 | — | upload／download／delete |
| resource_type | 資源類型 | VARCHAR | 否 | — | `teaching_material`／`exam_txt` |
| resource_id | 資源 ID | INTEGER | 否 | — | — |
| plan_id | 訓練計畫 ID | INTEGER | 否 | — | — |
| filename | 檔名 | VARCHAR | 否 | — | — |
| bytes | 傳輸位元組 | INTEGER | 否 | — | — |
| status | 結果 | VARCHAR | 否 | — | success／failed 等 |

---

#### `material_file_formats` — 教材允許副檔名主檔

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 流水號 | INTEGER | 是 | 是 | — |
| ext | 副檔名 | VARCHAR | 否 | — | UNIQUE，小寫無點 |
| label | 顯示名稱 | VARCHAR | 否 | — | — |
| sort_order | 排序 | INTEGER | 否 | — | — |
| max_file_bytes | 單檔上限 | INTEGER | 否 | — | null 不另限 |
| is_active | 是否啟用 | BOOLEAN | 否 | — | — |
| mime_types | MIME 預留 | TEXT | 否 | — | JSON，本期不驗證 |

---

#### `material_types` — 教材類型主檔

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 流水號 | INTEGER | 是 | 是 | — |
| name | 類型名稱 | VARCHAR | 否 | — | UNIQUE |
| slug | 目錄識別 | VARCHAR | 否 | — | UNIQUE |
| sort_order | 排序 | INTEGER | 否 | — | — |
| max_file_bytes | 類型單檔上限 | INTEGER | 否 | — | — |
| is_active | 是否啟用 | BOOLEAN | 否 | — | — |

---

#### `teaching_materials` — 教材目錄卡

| 欄位 | 中文說明 | 類型 | NOT NULL | PK | 備註 |
|------|----------|------|----------|----|------|
| id | 流水號 | INTEGER | 是 | 是 | — |
| plan_id | 訓練計畫 ID | INTEGER | 否 | — | FK；null＝通用教材 |
| title | 標題 | VARCHAR | 否 | — | — |
| material_type_id | 教材類型 | INTEGER | 否 | — | → `material_types.id` |
| description | 簡述 | VARCHAR | 否 | — | — |
| tags | 標籤 JSON | TEXT | 否 | — | — |
| original_filename | 原始檔名 | VARCHAR | 否 | — | 下載檔名來源 |
| stored_filename | NAS 檔名 | VARCHAR | 否 | — | — |
| storage_path | 儲存相對路徑 | VARCHAR | 否 | — | 邏輯 `/` 路徑 |
| file_format | 副檔名 | VARCHAR | 否 | — | — |
| file_size_bytes | 檔案大小 | INTEGER | 否 | — | — |
| year | 年度 | VARCHAR | 否 | — | — |
| sub_category_id | 分類快照 | INTEGER | 否 | — | 跨計畫篩選 |
| uploaded_by | 上傳者工號 | VARCHAR | 否 | — | — |
| uploaded_at | 上傳時間 | DATETIME | 否 | — | 索引 |
| is_active | 使用中 | BOOLEAN | 否 | — | 索引；軟刪 |
| deactivated_at | 停用時間 | DATETIME | 否 | — | — |
| deactivated_by | 停用者 | VARCHAR | 否 | — | — |
| replaced_by_id | 取代者 ID | INTEGER | 否 | — | 自參照 FK |
| replaces_id | 被取代者 ID | INTEGER | 否 | — | 自參照 FK |

---

### 5.4 關聯總表（FK 匯總）

| 子表 | 欄位 | 父表 | 父欄位 |
|------|------|------|--------|
| attendance_absence_reasons | plan_id | training_plans | id |
| attendance_absence_reasons | emp_id | users | emp_id |
| attendance_absence_reasons | recorded_by | users | emp_id |
| attendance_records | emp_id | users | emp_id |
| attendance_records | plan_id | training_plans | id |
| exam_details | record_id | exam_records | id |
| exam_details | question_id | questions | id |
| exam_history | record_id | exam_records | id |
| exam_records | emp_id | users | emp_id |
| exam_records | plan_id | training_plans | id |
| login_tokens | created_by | users | emp_id |
| plan_target_departments | plan_id | training_plans | id |
| plan_target_departments | dept_id | departments | id |
| plan_target_users | plan_id | training_plans | id |
| plan_target_users | emp_id | users | emp_id |
| questions | plan_id | training_plans | id |
| role_department_scope_depts | role_id | roles | id |
| role_department_scope_depts | dept_id | departments | id |
| role_department_scope_map | role_id | roles | id |
| role_department_scopes | role_id | roles | id |
| role_functions | role_id | roles | id |
| role_functions | function_id | system_functions | id |
| sub_categories | main_id | main_categories | id |
| system_functions | parent_id | system_functions | id |
| training_plans | sub_category_id | sub_categories | id |
| training_plans | dept_id | departments | id |
| users | dept_id | departments | id |
| users | role_id | roles | id |
| users | job_title_id | job_titles | id |
| teaching_materials | plan_id | training_plans | id |
| teaching_materials | material_type_id | material_types | id |
| teaching_materials | replaced_by_id | teaching_materials | id |
| teaching_materials | replaces_id | teaching_materials | id |

### 5.5 索引一覽

| 索引名稱 | 定義 |
|----------|------|
| ix_attendance_absence_reasons_id | `attendance_absence_reasons(id)` |
| ix_attendance_records_id | `attendance_records(id)` |
| ix_departments_id | `departments(id)` |
| ix_departments_name | UNIQUE `departments(name)` |
| ix_exam_details_id | `exam_details(id)` |
| ix_exam_history_id | `exam_history(id)` |
| ix_exam_records_id | `exam_records(id)` |
| ix_job_titles_id | `job_titles(id)` |
| ix_job_titles_name | UNIQUE `job_titles(name)` |
| ix_login_tokens_id | `login_tokens(id)` |
| ix_login_tokens_token | UNIQUE `login_tokens(token)` |
| ix_main_categories_id | `main_categories(id)` |
| ix_question_bank_id | `question_bank(id)` |
| ix_questions_id | `questions(id)` |
| ix_roles_id | `roles(id)` |
| ix_roles_name | UNIQUE `roles(name)` |
| ix_sub_categories_id | `sub_categories(id)` |
| ix_system_functions_id | `system_functions(id)` |
| ix_system_functions_code | UNIQUE `system_functions(code)` |
| ix_training_plans_id | `training_plans(id)` |
| ix_users_emp_id | `users(emp_id)` |

---

## 6. 參考文件

| 文件 / 路徑 | 說明 |
|-------------|------|
| `README.md` | 專案說明與 DB 路徑 |
| `backend/app/models.py` | SQLAlchemy 模型與表名對應 |
| `backend/app/database.py` | SQLite 連線路徑解析 |
| `1.docs/00-專案總覽/專案架構分析.md` | 架構與資料庫檔案位置 |
| `1.docs/02-棕地專案/棕地功能總覽.md` | 棕地波次與新表對照 |
| `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md` | 遷移腳本與 AD／教材相關欄位 |

---

## 7. 使用表單（欄位說明）

本節為「文件結構要求」之對應：本分析文件不綁定紙本表單；若需匯出為盤點表，建議以 **5.3 各表**（含欄位中文說明、長度）為列、複製至試算表即可。

---

## 附錄：產出方式（可重現）

於專案根目錄執行：

```bash
sqlite3 data/education_training.db ".schema"
sqlite3 data/education_training.db "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;"
# 各表：
sqlite3 data/education_training.db "PRAGMA table_info('表名');"
sqlite3 data/education_training.db "PRAGMA foreign_key_list('表名');"
```

---

**文件版本**：依 `data/education_training.db` 靜態掃描產出；2026-04-02 補齊表中文名、欄位中文說明與長度欄。
