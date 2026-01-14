# 刪除亂碼帳號的說明

## 找到的亂碼帳號
- **員工編號**: `㝡劈户崍亅亅肀廛郣乍𡕷秈㞗末刷末檗廛黂𠂆`
- **姓名**: `亂馬亂亂亂`

## 方法 1：使用 Python 腳本（推薦）

在終端機執行：

```bash
cd backend
.venv/bin/python3 remove_bad_user.py
```

## 方法 2：使用 SQLite 命令

```bash
sqlite3 data/education_training.db "DELETE FROM users WHERE emp_id = '㝡劈户崍亅亅肀廛郣乍𡕷秈㞗末刷末檗廛黂𠂆';"
```

## 方法 3：透過管理介面

如果後端 API 有提供刪除用戶的功能，可以透過管理介面刪除。

## 注意事項

如果遇到「attempt to write a readonly database」錯誤，請檢查資料庫檔案權限：

```bash
chmod 644 data/education_training.db
```

或者確保資料庫檔案所在的目錄有寫入權限。
