# 測試程式目錄

本目錄存放所有測試程式，包括：
- API 測試腳本
- 單元測試
- 整合測試
- 其他驗證測試程式

## 測試文件組織規範

### 測試程式位置
- **所有測試程式** → `tests/` 目錄
- **測試文件/報告** → `1.docs/reviews/` 目錄

### 檔案說明

#### API 測試
- `test_new_apis.py` - 測試新建立的 API 端點（自動化測試）
- `test_new_apis.sh` - 測試新建立的 API 端點（Shell 腳本）
- `test_error_detail.py` - 詳細錯誤測試腳本

#### 功能測試
- `test_exam_upload.py` - 考試上傳功能測試
- `test_parser.py` - 題目解析器測試
- `test_report.py` - 報表功能測試

## 使用方式

### 執行 Python 測試
```bash
# 確保後端服務已啟動
cd backend
export PYTHONPATH=$PYTHONPATH:.
.venv/bin/python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 在另一個終端執行測試
cd tests
python3 test_new_apis.py
```

### 執行 Shell 測試
```bash
# 需要先設定 TOKEN 環境變數或修改腳本中的 TOKEN
chmod +x test_new_apis.sh
./test_new_apis.sh
```

## 注意事項

1. 所有測試程式應放在此目錄
2. 測試產生的報告和文件應放在 `1.docs/reviews/` 目錄
3. 測試臨時文件（如測試資料庫、測試上傳檔案）應在 `.gitignore` 中排除
