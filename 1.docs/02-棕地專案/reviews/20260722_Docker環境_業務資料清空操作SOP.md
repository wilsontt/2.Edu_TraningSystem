# Docker 環境：業務資料清空操作 SOP

| 項目 | 內容 |
|------|------|
| 日期 | 2026-07-22 |
| 狀態 | 長青操作步驟（依對齊文件範圍執行） |
| 適用主機 | **ds1**（開發測試 Docker）、**corwndocker**（正式 Docker） |
| 清空範圍 | 見 [20260722_業務資料清空_訓練計畫報到成績考卷_待刪對齊.md](20260722_業務資料清空_訓練計畫報到成績考卷_待刪對齊.md) §2、§5 |
| 容器內 DB | `/data/education_training.db` |
| 主機 DB | `${DATA_ROOT}/training/education_training.db` |

---

## 1. 目的

說明如何在 EIP Docker（`training-backend`）內，依對齊文件 §5.4 清空訓練計畫／報到／成績／考卷工坊（計畫題）等業務資料，並保留人員、歷史題庫、教材庫。

---

## 2. 範圍

| 涵蓋 | 不涵蓋 |
|------|--------|
| ds1、corwndocker 上 `training-backend` 之 SQLite 清空 | 本機 Mac／Windows 開發（直接改專案 `data/`） |
| 主機端 DB 備份、容器內 Python 執行 DELETE | 用本機 DB 整包覆蓋正式機 |
| 清空後計數驗證 | NAS 實體檔刪除、EIP 其他子系統 |

**原則**：ds1 與 corwndocker 的 volume **分開**；兩邊要清就**各做一次**。建議先 ds1 驗證 UI，再 corwndocker。

---

## 3. 權責

| 角色 | 權責 |
|------|------|
| 部署／維運 | 在目標主機備份、執行本 SOP、驗證 |
| 需求方 | 確認可清空之環境（尤其正式機） |
| 開發 | 維護本 SOP 與對齊文件一致 |

---

## 4. 名詞解釋

| 名詞 | 說明 |
|------|------|
| **EIP `deploy/`** | 例：`/opt/apps/enterprise-portal/deploy`；於此目錄執行 `docker compose` |
| **`DATA_ROOT`** | `deploy/.env` 變數；主機掛載至容器 `/data` |
| **`training-backend`** | FastAPI 後端 service 名 |
| **§5.4** | 對齊文件中的 DELETE／UPDATE SQL 骨架 |

---

## 5. 作業內容

### 5.1 前置檢查

```bash
cd /opt/apps/enterprise-portal/deploy   # 依實際路徑調整

docker compose ps training-backend
grep -E '^DATA_ROOT=' .env
```

確認：

- 容器 `training-backend` 為 running（或你打算先 `stop` 再清）。
- 已讀過對齊文件：保留 `question_bank`、教材庫、`users`；刪業務表。

### 5.2 主機端備份（必做）

```bash
# DATA_ROOT 以 .env 為準；下列為路徑組合方式
DB_HOST="${DATA_ROOT}/training/education_training.db"
# 若 shell 未 export DATA_ROOT，可先：
#   export DATA_ROOT=$(grep -E '^DATA_ROOT=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")

sudo cp "${DATA_ROOT}/training/education_training.db" \
  "${DATA_ROOT}/training/education_training.db.bak-$(date +%Y%m%d)-before-business-wipe"

ls -la "${DATA_ROOT}/training/education_training.db"*
```

（可選）減少寫入中備份：

```bash
docker compose stop training-backend
# 完成 §5.2 備份後
docker compose start training-backend
```

### 5.3 容器內執行清空（建議：Python）

映像未必有 `sqlite3` CLI；用 `training-backend` 內 Python 最穩：

```bash
cd /opt/apps/enterprise-portal/deploy

docker compose exec training-backend python - <<'PY'
import sqlite3

db = "/data/education_training.db"
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute("BEGIN")

statements = [
    "DELETE FROM exam_retake_authorizations",
    "DELETE FROM exam_details",
    "DELETE FROM exam_history",
    "DELETE FROM exam_records",
    "DELETE FROM attendance_batch_absence_reasons",
    "DELETE FROM attendance_absence_reasons",
    "DELETE FROM attendance_checkin_events",
    "DELETE FROM attendance_checkin_batch_plans",
    "DELETE FROM attendance_checkin_batches",
    "DELETE FROM attendance_records",
    "DELETE FROM login_tokens",
    "DELETE FROM questions",
    "DELETE FROM plan_target_users",
    "DELETE FROM plan_target_departments",
    "DELETE FROM teaching_material_set_plans",
    "UPDATE teaching_materials SET plan_id = NULL WHERE plan_id IS NOT NULL",
    "DELETE FROM training_plans",
]

for sql in statements:
    cur.execute(sql)
    target = sql.split()[2] if not sql.startswith("UPDATE") else "teaching_materials"
    print(f"OK changes={cur.rowcount:5d}  {sql}")

conn.commit()

print("--- verify (expect 0) ---")
for t in [
    "training_plans", "exam_records", "exam_details", "exam_history",
    "exam_retake_authorizations", "attendance_records",
    "attendance_checkin_events", "attendance_absence_reasons",
    "attendance_batch_absence_reasons", "attendance_checkin_batches",
    "attendance_checkin_batch_plans", "questions",
    "plan_target_users", "plan_target_departments", "login_tokens",
    "teaching_material_set_plans",
]:
    n = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"COUNT {t} = {n}")

print("--- keep (expect > 0) ---")
print("question_bank =", cur.execute("SELECT COUNT(*) FROM question_bank").fetchone()[0])
print("teaching_materials =", cur.execute("SELECT COUNT(*) FROM teaching_materials").fetchone()[0])
print("teaching_material_sets =", cur.execute("SELECT COUNT(*) FROM teaching_material_sets").fetchone()[0])
print("teaching_material_files =", cur.execute("SELECT COUNT(*) FROM teaching_material_files").fetchone()[0])
print("users =", cur.execute("SELECT COUNT(*) FROM users").fetchone()[0])
print(
    "materials.plan_id非空 =",
    cur.execute("SELECT COUNT(*) FROM teaching_materials WHERE plan_id IS NOT NULL").fetchone()[0],
)
conn.close()
print("DONE")
PY
```

### 5.4 替代：容器內有 sqlite3 CLI 時

```bash
docker compose exec -T training-backend sqlite3 /data/education_training.db <<'SQL'
BEGIN;
DELETE FROM exam_retake_authorizations;
DELETE FROM exam_details;
DELETE FROM exam_history;
DELETE FROM exam_records;
DELETE FROM attendance_batch_absence_reasons;
DELETE FROM attendance_absence_reasons;
DELETE FROM attendance_checkin_events;
DELETE FROM attendance_checkin_batch_plans;
DELETE FROM attendance_checkin_batches;
DELETE FROM attendance_records;
DELETE FROM login_tokens;
DELETE FROM questions;
DELETE FROM plan_target_users;
DELETE FROM plan_target_departments;
DELETE FROM teaching_material_set_plans;
UPDATE teaching_materials SET plan_id = NULL WHERE plan_id IS NOT NULL;
DELETE FROM training_plans;
COMMIT;
SQL
```

### 5.5 重啟與 UI 驗證

```bash
docker compose restart training-backend
```

| 檢查 | 預期 |
|------|------|
| 訓練計畫列表 | 空 |
| 報到總覽／成績中心 | 無業務資料 |
| 考卷工坊計畫題 | 無（因無計畫） |
| 歷史題庫／教材庫／人員管理 | 仍有資料 |

### 5.6 兩主機執行紀錄（請填）

| 主機 | 備份檔名 | 執行日期 | 執行人 | 驗證 |
|------|----------|----------|--------|------|
| ds1（測試） | | | | ☐ |
| corwndocker（正式） | | | | ☐ |

---

## 6. 參考文件

- [20260722_業務資料清空_訓練計畫報到成績考卷_待刪對齊.md](20260722_業務資料清空_訓練計畫報到成績考卷_待刪對齊.md) — 刪除範圍與本機執行紀錄
- [生產部署指南.md](../../00-專案總覽/生產部署指南.md) — `DATA_ROOT`、`training-backend`、`docker compose exec`
- [主機搬遷與災備還原SOP.md](../../00-專案總覽/主機搬遷與災備還原SOP.md) — DB 路徑與備份責任邊界

---

## 7. 使用表單（欄位說明）

無紙本表單；以 §5.6 表格為執行紀錄。

| 欄位 | 說明 |
|------|------|
| 主機 | ds1 或 corwndocker |
| 備份檔名 | `${DATA_ROOT}/training/education_training.db.bak-…` |
| 驗證 | §5.5 計數與 UI 皆通過 |

---

## 禁止事項

- **禁止**將開發機 `data/education_training.db` 直接 scp 覆蓋正式 volume 來「代替」本清空。
- **禁止**在未備份正式機 DB 前於 corwndocker 執行 §5.3。
- **禁止**誤以為清 ds1 會連帶清正式機。
