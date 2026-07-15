# 測試程式目錄（`tests/`）

本目錄為專案根目錄下的**可執行測試**（pytest／腳本）與 **fixtures**。  
**不**放入 `1.docs/`（文件與程式分離）。

| 類型 | 放置處 |
|------|--------|
| 自動化測試、單元／API 測試、fixtures | **`tests/`**（本目錄） |
| 測試手冊、審查、修復紀錄 | [`1.docs/02-棕地專案/reviews/`](../1.docs/02-棕地專案/reviews/README.md) |
| 棕地任務單／驗收 | [`1.docs/02-棕地專案/交付實作文件/`](../1.docs/02-棕地專案/交付實作文件/README.md) |
| UAT 文件 | [`1.docs/系統測試/`](../1.docs/系統測試/) |

---

## 目錄內容概要

| 路徑 | 用途 |
|------|------|
| `conftest.py` | pytest 共用 fixture（路徑、in-memory DB、client 等） |
| `fixtures/` | 考卷 TXT、人員匯入範本等測資 |
| `test_new_apis.py`／`.sh` | 整合式 API 煙測（**需**後端已啟動於 port 8000） |
| `test_ad_auth.py`、`test_jit_provision.py`、`test_email_otp.py`、`test_password_policy.py` | AD／JIT／OTP／密碼政策 |
| `test_storage_unit.py` | NAS／SMB storage 抽象（mock） |
| `test_parser.py`、`test_exam_upload.py`、`test_report.py`、`test_batch_print_helpers.py` | 考卷解析、上傳、報表／列印輔助 |
| `test_exam_time_semantics.py` | 考試時間語意（UTC naive 等） |
| `test_role_active_member_count.py` | 角色在職成員數語意 |
| `test_teaching_material_set*.py`、`test_teaching_materials_router_wave1_removed.py` | 教材套組 Wave2 與舊路由邊界 |
| `test_error_detail.py` | 錯誤回應細節 |

> `tests/load/`（Locust）若尚未建立，見交付文件 [用 Locust 對本機後端做壓力測](../1.docs/02-棕地專案/交付實作文件/20260711_用 Locust 對本機後端做壓力測_禁止打生產.md)。

---

## 執行方式

### A. pytest（多數單元／API 測試；建議）

於**專案根目錄**（`conftest.py` 會處理 `backend/` 路徑）：

```bash
# Linux / macOS
backend/.venv/bin/python3 -m pytest tests/ -q

# 單一檔
backend/.venv/bin/python3 -m pytest tests/test_teaching_material_sets_api.py -v
```

Windows（PowerShell）：

```powershell
.\backend\.venv\Scripts\python.exe -m pytest tests/ -q
```

### B. 需先啟動後端的煙測

```bash
# Terminal 1：後端
cd backend
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd tests
python3 test_new_apis.py
# 或：./test_new_apis.sh（需自行設定 TOKEN）
```

---

## 注意事項

1. **權威測試程式路徑 = 專案根 `tests/`**；勿移入 `1.docs/`。  
2. `__pycache__`、`.pytest_cache`、臨時 DB／上傳檔應由 `.gitignore` 排除。  
3. 前端以 `npm run lint`／`npm run build` 與手動／瀏覽器驗證為主；目前無前端 jest／vitest 套件。  
4. 正式環境 **禁止** 對生產做壓力測（見 Locust 交付文件）。

---

**最後更新**：2026-07-15
