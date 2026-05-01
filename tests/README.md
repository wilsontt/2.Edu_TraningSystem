# 測試程式目錄

本目錄存放**可執行**之測試腳本（API、解析器、報表等）。測試說明、手冊與審查報告請置於 **`1.docs/reviews/`**；棕地迭代之任務單與驗收追溯請見 **`1.docs/交付實作文件/README.md`**。

---

## 檔案說明

| 檔案 | 用途 |
|------|------|
| `test_new_apis.py` | 新 API 端點自動化測試（需後端已啟動） |
| `test_new_apis.sh` | 同上之 Shell 版本（需設定或修改 TOKEN） |
| `test_error_detail.py` | 錯誤回應細節測試 |
| `test_exam_upload.py` | 考試上傳流程 |
| `test_parser.py` | 題目 TXT 解析器 |
| `test_report.py` | 報表相關 |

---

## 執行方式

### Python（需後端運行於預設埠）

```bash
cd backend
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

另開終端：

```bash
cd tests
python3 test_new_apis.py
```

### Shell

```bash
cd tests
chmod +x test_new_apis.sh
# 依腳本要求設定 TOKEN 或改寫腳本內變數後執行
./test_new_apis.sh
```

---

## 注意事項

1. 測試程式集中於本目錄；文件與報告放 `1.docs/reviews/`。  
2. 臨時資料庫或上傳測試檔應排除於版本庫（`.gitignore`）。  
3. 前端目前以手動與瀏覽器驗證為主；自動化可後續於 `frontend/` 增補。

---

**最後更新**：2026-05-01
