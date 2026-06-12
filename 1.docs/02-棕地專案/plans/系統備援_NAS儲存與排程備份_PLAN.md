# 系統備援：NAS 檔案儲存與排程備份實作計劃 (PLAN)

**文件類型**：實作計劃（PLAN，僅設計，不含程式碼）
**建立日期**：2026-06-12
**狀態**：草案（待核可後進入技術設計與實作）
**對應需求**：考卷／教材檔案改存遠端 NAS（SMB）；資料庫＋當日 materials 以排程方式打包 ZIP 備份至 NAS，並依設定保留份數。

> 本計劃依使用者全域規範採 7 大結構：目的／範圍／權責／名詞解釋／作業內容／參考文件／使用表單。

---

## 1. 目的

1. 將考卷工坊上傳之 **TXT 考卷** 與 **教材（PDF 等）** 統一存放於**遠端 NAS（SMB）**，本地不再保留副本。
2. 提供**排程備份**：依設定時間，將 **`education_training.db` ＋ 當日 materials 快照** 打包為單一 ZIP，存至 NAS。
3. 提供**排程設定介面**：可設定備份時間與**保留份數**（rotation），超出份數自動清除最舊備份。
4. 順帶修正既有**路徑分裂**問題（`backend/data/materials` vs 根 `data/`），並將參考用 PDF 由 `data/教材/` 移出至文件區。

---

## 2. 範圍

### 2.1 涵蓋範圍（In Scope）

- 上傳檔案儲存後端抽象化：本地檔案系統 → **SMB（NAS）**。
- 考卷與教材**統一目錄結構**（同計畫下分 `exams/`、`teaching/`）。
- 上傳教材（PDF 等）之新增能力（考卷工坊／訓練計畫，與 TXT 共用儲存層）。
- 排程備份服務：DB ＋ materials 快照 → ZIP → NAS；保留份數輪替。
- 排程設定之**管理介面**與設定持久化。
- 還原（restore）作業 SOP（文件化；還原可半自動）。

### 2.2 不涵蓋範圍（Out of Scope）

- NAS 本身之 RAID／硬體備援與機房異地備份（屬基礎設施）。
- 資料庫由 SQLite 改為其他 DBMS（本期維持 SQLite）。
- 邏輯層 JSON 匯出／匯入：**列為選配**（見 5.8），本期不作為主要 DR 手段。

### 2.3 已確認決策

| 決策點 | 結論 |
|--------|------|
| 檔案儲存 | **遠端 NAS，SMB 協定**（先以此為主，日後可換） |
| 本地副本 | TXT 考卷、PDF 教材**本地不再保存** |
| 備份內容 | **DB ＋ 當日 materials 快照**，打包為一個 ZIP |
| 備份觸發 | **排程**（可於設定介面設定時間） |
| 保留策略 | 依設定**備份份數**輪替，超出自動刪最舊 |
| 備份目的地 | **NAS** |
| 統一目錄 | `materials/{year}/{plan_id}/exams|teaching/` |
| 參考 PDF | `data/教材/` → 移至 `1.docs/00-專案總覽/參考教材/` |

---

## 3. 權責

| 角色 | 權責 |
|------|------|
| 後端開發 | 儲存抽象層（SMB）、上傳流程改寫、排程備份服務、設定 API |
| 前端開發 | 排程設定介面、教材上傳 UI、備份紀錄檢視 |
| IT／NAS 管理員 | 提供 SMB 路徑／共享、服務帳號與權限、防火牆與掛載 |
| 系統管理者（業主） | 設定備份時間與保留份數；定期檢視備份結果 |
| 測試 | 依 5.9 驗收案例執行（含還原演練） |

---

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| **NAS** | 網路儲存設備 |
| **SMB** | Server Message Block，Windows 檔案共享協定（亦稱 CIFS） |
| **materials** | 上傳檔案根目錄，含考卷 TXT 與教材 |
| **快照（snapshot）** | 備份當下 materials 之檔案複本集合 |
| **rotation／保留份數** | 僅保留最近 N 份備份，超出刪最舊 |
| **L1 實體備份** | 直接打包 DB 檔與檔案（本計劃主軸） |
| **L2 邏輯匯出** | DB 結構化資料匯出為 JSON（本計劃選配） |
| **DATA_ROOT** | 執行期資料根路徑（環境變數，統一本地／容器） |

---

## 5. 作業內容

### 5.1 統一儲存目錄結構

NAS 上（SMB 掛載點之下）採：

```
{MATERIALS_ROOT}/
└── {year}/
    └── {plan_id}/
        ├── exams/      # TXT 考卷原始檔
        └── teaching/   # 教材（PDF 等）

{BACKUP_ROOT}/
└── education_training_backup_{YYYYMMDD_HHmm}.zip
```

> `MATERIALS_ROOT`、`BACKUP_ROOT` 均指向 NAS（SMB）路徑，以環境變數設定。

### 5.2 路徑統一（修正既有債）

- `backend/app/routers/exam.py` 現用相對路徑 `Path("data/materials")`，依啟動 cwd 落在 `backend/data/materials`，與 `database.py` 的根 `data/` 分裂。
- **改為**：讀取環境變數 `MATERIALS_ROOT`（NAS）作為唯一根；本地不再寫檔。
- `database.py` 之 DB 路徑維持專案根 `data/`（DB 仍為本地單檔，由備份服務上傳 NAS）。

### 5.3 儲存抽象層（SMB）

- 新增儲存服務（如 `backend/app/services/storage.py`），介面：`save / open / list / delete`。
- 後端可採二擇一（技術設計時定案）：
  - **OS 掛載**：由主機將 SMB 掛載為本地路徑（如 `/mnt/nas/training`），程式仍走檔案 I/O（最單純）。
  - **程式內 SMB 客戶端**：使用 `smbprotocol` 套件直連（免主機掛載，部署較彈性）。
- 上傳流程（`/admin/exams/upload`、未來教材上傳）改呼叫儲存層；**移除本地落地**。

### 5.4 教材上傳能力（與 TXT 共用儲存層）

- 新增教材上傳端點（PDF 等），存入 `{plan_id}/teaching/`。
- 沿用既有大小限制需求（綠地需求：檔案 ≤ 5MB，不解析內容）。
- 列表／預覽／刪除比照現有 materials API，區分 `exams` / `teaching` 子類。

### 5.5 排程備份服務

- 新增備份服務，工作內容：
  1. 對 SQLite 執行一致性備份（`sqlite3 .backup` 或線上備份 API，避免寫入中複製）。
  2. 擷取**當日 materials 快照**（自 NAS materials 複製，或就地打包）。
  3. 打包 DB ＋ 快照為單一 ZIP，含 `manifest.json`（時間、schema 版本、檔案清單、來源路徑）。
  4. 上傳 ZIP 至 `BACKUP_ROOT`（NAS）。
  5. 依**保留份數**刪除最舊 ZIP。
  6. 寫入備份紀錄（成功／失敗、檔名、大小、耗時）。
- 排程器選型（技術設計定案）：`APScheduler`（隨後端進程）或主機層 `cron`／工作排程器。建議 **APScheduler**，以利由設定介面動態調整。

### 5.6 排程設定介面（管理端）

- 新增設定頁（需 `系統管理` 權限），可設定：
  - 是否啟用排程備份
  - 備份頻率與時間（每日／每週＋時:分）
  - 保留份數（N）
  - NAS 目的地（唯讀顯示或可編輯，視權責）
- 設定持久化：新增設定表或沿用既有設定機制（技術設計定案）。
- 提供「**立即備份一次**」按鈕與「**備份紀錄**」清單。

### 5.7 設定環境變數

| 變數 | 用途 | 範例 |
|------|------|------|
| `DATA_ROOT` | 執行期資料根（DB） | `/app/data` |
| `MATERIALS_ROOT` | NAS 上傳根（SMB 掛載點或 UNC） | `/mnt/nas/training/materials` |
| `BACKUP_ROOT` | NAS 備份目的地 | `/mnt/nas/training/backups` |
| `SMB_*`（選用） | 程式內 SMB 客戶端時的伺服器／共享／帳密 | 視 5.3 方案 |

> SMB 帳密屬機敏，須走環境變數／密鑰管理，不可入庫、不可進版控。

### 5.8 邏輯匯出／匯入（選配，非本期主軸）

- 如未來需跨環境遷移或單表修復，可再提供 `GET /admin/backup/export`（JSON full）與 `POST /admin/backup/import`（dry_run／merge／replace）。
- 註記：JSON **不含**教材實體檔，實體檔一律依賴 NAS 與 ZIP 快照。

### 5.9 驗收條件

| # | 案例 | 期望 |
|---|------|------|
| 1 | 上傳 TXT 考卷 | 落在 NAS `{plan_id}/exams/`，本地無副本 |
| 2 | 上傳教材 PDF | 落在 NAS `{plan_id}/teaching/`，大小限制生效 |
| 3 | 列表／預覽／刪除 | 正確區分 exams／teaching |
| 4 | 設定每日 02:00、保留 7 份 | 屆時自動產生 ZIP 至 NAS |
| 5 | 連續備份至第 8 份 | 自動刪除最舊，恆維持 7 份 |
| 6 | 「立即備份」 | 即時產生 ZIP 並記錄 |
| 7 | ZIP 內容 | 含可還原之 DB ＋ materials 快照 ＋ manifest |
| 8 | 還原演練 | 依 SOP 由 ZIP 還原後系統可正常運作 |
| 9 | NAS 不可達 | 備份失敗有明確紀錄與告警，不影響線上服務 |
| 10 | `data/教材/` | 已移至 `1.docs/00-專案總覽/參考教材/`，文件連結同步 |

### 5.10 還原 SOP（概要，細節於技術設計補完）

1. 自 NAS 取得目標 ZIP，校驗 `manifest.json`。
2. 停止後端寫入。
3. 還原 `education_training.db`（覆蓋前先另存現況）。
4. 還原 materials 至 `MATERIALS_ROOT`。
5. 啟動後端，依驗收案例抽測。

---

## 6. 參考文件

- `backend/app/routers/exam.py`（現行上傳／materials 路徑）
- `backend/app/database.py`（DB 路徑解析）
- `Dockerfile.backend`（`/data` symlink 與 volume 掛載現況）
- `1.docs/00-專案總覽/20260316_教育訓練系統.md`（`backend/data/materials` 與掛載說明）
- `1.docs/01-綠地專案/教育訓練線上考卷系統 - 需求分析.md`（教材上傳需求、5MB 限制）
- `1.docs/00-專案總覽/資料庫遷移/MIGRATION_GUIDE.md`
- 套件：`APScheduler`、`smbprotocol`（視方案）

---

## 7. 使用表單（欄位說明）

### 7.1 備份排程設定 `BackupScheduleConfig`

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `enabled` | boolean | 是 | 是否啟用排程備份 |
| `frequency` | string | 是 | `daily` / `weekly` |
| `time_of_day` | string | 是 | `HH:mm`（24 小時） |
| `weekday` | int | 否 | `frequency=weekly` 時，0–6 |
| `retention_count` | int | 是 | 保留份數 N（≥1） |
| `destination` | string | 是 | NAS 備份路徑（`BACKUP_ROOT`） |

### 7.2 備份紀錄 `BackupRecord`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | int | 主鍵 |
| `filename` | string | ZIP 檔名 |
| `created_at` | datetime | 產生時間 |
| `size_bytes` | int | 檔案大小 |
| `status` | string | `success` / `failed` |
| `message` | string | 失敗原因或摘要 |
| `duration_ms` | int | 耗時 |

### 7.3 備份包內 `manifest.json`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `schema_version` | string | 結構版本，還原相容性判斷 |
| `created_at` | string(ISO) | 備份時間 |
| `app_version` | string | 系統版本 |
| `db_file` | string | DB 檔名與相對路徑 |
| `materials_count` | int | 快照檔案數 |
| `files` | string[] | 快照檔案清單 |

---

## 8. 風險與待確認

| 項目 | 說明 |
|------|------|
| SMB 方案 | OS 掛載 vs 程式內 `smbprotocol`，影響部署與錯誤處理，技術設計定案 |
| SQLite 一致性 | 備份須用 `.backup`／線上備份 API，避免寫入中複製造成毀損 |
| 大檔與時間 | materials 增大後 ZIP 時間／空間成本；必要時改增量備份 |
| NAS 認證機敏 | SMB 帳密需密鑰管理，嚴禁入庫／入版控 |
| 無本地副本風險 | 本地不留檔，NAS 不可達時上傳將失敗；需明確錯誤與告警 |
| 告警機制 | 備份失敗如何通知（Log／Email／前端紅點）待業主決定 |
| 還原權限 | 還原為高風險操作，是否限 break-glass 或 IT 手動執行待定 |

---

**最後更新**：2026-06-12
