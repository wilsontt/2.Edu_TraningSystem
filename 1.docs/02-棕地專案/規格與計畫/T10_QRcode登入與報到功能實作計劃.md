# T10: QRcode 登入與報到功能實作計劃

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-Completed-green)

**版本 Version**：v1.0.0  
**建立日期 Created**：2026-01-10  
**最近修訂 Last Amended**：2026-01-10  
**狀態**：✅ 已完成

---

## 📋 目標

1. **登入 QRcode 功能**：Admin 可在系統管理中產生動態登入 QRcode，供手機用戶掃描後快速登入系統（仍需輸入員工編號和驗證碼）
2. **考試前報到功能**：用戶登入後，在考試中心選擇訓練計畫，需先完成報到才能開始考試
3. **報到記錄與統計**：記錄報到時間，統計應到/實到人數，支援手動修改應到人數
4. **報到 QRcode 功能**：Admin 和訓練計畫管理者可在訓練計畫管理中產生報到 QRcode，供用戶掃描後快速報到

---

## 🎯 功能需求

### 1. 登入 QRcode 功能

#### 後端需求
- ✅ 資料庫 `LoginToken` 表（儲存登入 token 資訊）
- ✅ 產生登入 QRcode API（`POST /admin/qrcode/login/generate`）
- ✅ QRcode 驗證 API（`GET /auth/login/qrcode/{token}`）
- ✅ QRcode 登入 API（`POST /auth/login/qrcode/{token}`）
- ✅ 查詢登入 Token 列表 API（`GET /admin/qrcode/login/tokens`）
- ✅ 刪除 Token API（`DELETE /admin/qrcode/login/tokens/{token_id}`）
- ✅ 重新生成 QRcode API（`POST /admin/qrcode/login/tokens/{token_id}/regenerate-qrcode`）
- ✅ **支援多人使用**：同一個 QRcode 可以被多人同時使用（只檢查過期，不檢查 is_used）
- ✅ **仍需要驗證碼**：掃描 QRcode 後仍需輸入員工編號和驗證碼才能登入

#### 前端需求
- ✅ QRcode 管理介面（`QRCodeManager.tsx`）
- ✅ QRcode 登入頁面（`QRCodeLoginPage.tsx`）
- ✅ Token 歷史記錄顯示
- ✅ 顯示/重新生成 QRcode 功能
- ✅ 刪除 Token 功能
- ✅ 複製登入連結功能

### 2. 報到功能

#### 後端需求
- ✅ 資料庫 `AttendanceRecord` 表（儲存報到記錄）
- ✅ 資料庫 `TrainingPlan.expected_attendance` 欄位（應到人數）
- ✅ 檢查報到狀態 API（`GET /exam/plan/{plan_id}/attendance/status`）
- ✅ 執行報到 API（`POST /exam/plan/{plan_id}/attendance/checkin`）
- ✅ 報到統計 API（`GET /training/plans/{plan_id}/attendance/stats`）
- ✅ 更新應到人數 API（`PUT /training/plans/{plan_id}/expected-attendance`）
- ✅ 自動計算應到人數 API（`GET /training/plans/{plan_id}/calculate-expected-attendance`）
- ✅ 報到檢查邏輯：
  - 檢查是否重複報到
  - 檢查計畫是否在有效期間內
  - 檢查用戶是否在受課對象中

#### 前端需求
- ✅ 報到按鈕組件（`CheckInButton.tsx`）
- ✅ 報到頁面（`CheckInPage.tsx`）
- ✅ 考試中心整合報到功能（`ExamDashboard.tsx`）
- ✅ 考試前檢查報到狀態（`ExamRunner.tsx`）
- ✅ 訓練計畫管理報到統計（`TrainingPlanManager.tsx`）

### 3. 報到 QRcode 功能

#### 後端需求
- ✅ 產生報到 QRcode API（`POST /training/plans/{plan_id}/checkin-qrcode/generate`）
- ✅ 權限控制：Admin 和「訓練計劃」角色可產生報到 QRcode
- ✅ 動態 URL 生成（不依賴固定 IP）

#### 前端需求
- ✅ 訓練計畫管理介面中顯示報到 QRcode 生成功能
- ✅ 報到統計模態框中顯示 QRcode
- ✅ 複製報到連結功能

---

## 🔧 實作內容

### 1. 資料庫結構

**已實作**：`backend/app/models.py`

#### LoginToken 模型
```python
class LoginToken(Base):
    __tablename__ = "login_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)  # 動態產生的 token
    created_by = Column(String, ForeignKey("users.emp_id"))  # 建立者（Admin）
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime)  # 過期時間（例如：24小時後）
    used_at = Column(DateTime, nullable=True)  # 首次使用時間（可選，用於統計）
    is_used = Column(Boolean, default=False)  # 是否已使用（保留欄位，但不再限制登入）
```

#### AttendanceRecord 模型
```python
class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    id = Column(Integer, primary_key=True, index=True)
    emp_id = Column(String, ForeignKey("users.emp_id"))
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    checkin_time = Column(DateTime, default=datetime.datetime.utcnow)  # 報到時間
    ip_address = Column(String, nullable=True)  # 報到時的 IP（可選）
    
    user = relationship("User", back_populates="attendance_records")
    training_plan = relationship("TrainingPlan", back_populates="attendance_records")
```

#### TrainingPlan 模型擴充
```python
class TrainingPlan(Base):
    # ... 現有欄位 ...
    expected_attendance = Column(Integer, nullable=True)  # 應到人數（可手動修改，預設為受課部門人數）
    attendance_records = relationship("AttendanceRecord", back_populates="training_plan")
```

### 2. 後端 API

#### 登入 QRcode 管理 API（`backend/app/routers/qrcode.py`）

**已實作**：
- ✅ `POST /admin/qrcode/login/generate` - 產生登入 QRcode（僅 Admin）
- ✅ `GET /auth/login/qrcode/{token}` - 驗證 QRcode token 是否有效且未過期
- ✅ `POST /auth/login/qrcode/{token}` - 使用 QRcode token 登入（需輸入員工編號和驗證碼）
- ✅ `GET /admin/qrcode/login/tokens` - 查詢所有產生的登入 token（含使用狀態）
- ✅ `DELETE /admin/qrcode/login/tokens/{token_id}` - 刪除指定的登入 token
- ✅ `POST /admin/qrcode/login/tokens/{token_id}/regenerate-qrcode` - 為現有的 token 重新生成 QRcode

**關鍵特性**：
- 動態 URL 生成：支援環境變數 `FRONTEND_URL`、從 Referer 推斷、或從請求 header 獲取
- 支援多人使用：同一個 QRcode 可以被多人使用（只檢查過期，不檢查 is_used）
- 仍需驗證碼：登入時需要輸入員工編號和驗證碼
- Token 有效期：24 小時

#### 報到功能 API（`backend/app/routers/exam_center.py`）

**已實作**：
- ✅ `GET /exam/plan/{plan_id}/attendance/status` - 檢查當前用戶是否已報到該計畫
- ✅ `POST /exam/plan/{plan_id}/attendance/checkin` - 執行報到動作

**報到邏輯**：
1. 檢查是否已報到（避免重複報到）
2. 檢查計畫是否在有效期間內（`training_date <= today <= end_date`）
3. 檢查用戶是否在受課對象中（`target_departments`）
4. 建立 `AttendanceRecord`，記錄報到時間和 IP 地址

#### 報到統計 API（`backend/app/routers/training.py`）

**已實作**：
- ✅ `GET /training/plans/{plan_id}/attendance/stats` - 取得該計畫的報到統計
- ✅ `PUT /training/plans/{plan_id}/expected-attendance` - 手動設定應到人數
- ✅ `GET /training/plans/{plan_id}/calculate-expected-attendance` - 根據 `target_departments` 自動計算應到人數

**統計內容**：
- 應到人數（可手動修改，預設為受課部門人數）
- 實到人數（已報到記錄數）
- 出席率（實到 / 應到 * 100）
- 已報到用戶列表（含報到時間）
- 未報到用戶列表

#### 報到 QRcode 生成 API（`backend/app/routers/training.py`）

**已實作**：
- ✅ `POST /training/plans/{plan_id}/checkin-qrcode/generate` - 產生報到 QRcode（Admin 或 menu:plan 權限）

**關鍵特性**：
- 動態 URL 生成（與登入 QRcode 相同邏輯）
- 掃描後導向報到頁面（`/checkin?plan_id={plan_id}`）

### 3. 前端組件

#### QRcode 登入管理（`frontend/src/components/admin/QRCodeManager.tsx`）

**已實作**：
- ✅ 產生登入 QRcode 按鈕
- ✅ 顯示產生的 QRcode 圖片（Base64）
- ✅ 顯示 token 資訊（過期時間）
- ✅ 複製登入連結功能（支援 Clipboard API 和備用方案）
- ✅ Token 歷史記錄列表
- ✅ 顯示 QRcode 功能（在歷史記錄中）
- ✅ 刪除 Token 功能
- ✅ 狀態顯示（有效中/已過期，支援多人使用）

#### QRcode 登入頁面（`frontend/src/components/QRCodeLoginPage.tsx`）

**已實作**：
- ✅ Token 驗證（進入頁面時）
- ✅ 驗證碼載入與顯示
- ✅ 員工編號輸入欄位
- ✅ 驗證碼輸入欄位
- ✅ 驗證碼刷新功能
- ✅ 登入處理（包含驗證碼驗證）
- ✅ 錯誤處理與提示
- ✅ 成功後自動跳轉

#### 報到功能組件

**CheckInButton.tsx**（`frontend/src/components/exam/CheckInButton.tsx`）：
- ✅ 檢查報到狀態
- ✅ 顯示報到按鈕或已報到狀態
- ✅ 報到確認對話框
- ✅ 報到成功後更新 UI

**CheckInPage.tsx**（`frontend/src/components/exam/CheckInPage.tsx`）：
- ✅ 從 URL 參數獲取 `plan_id`
- ✅ 檢查報到狀態
- ✅ 顯示報到按鈕或已報到狀態
- ✅ 報到成功後可選擇開始考試或返回考試中心

**ExamDashboard.tsx**（`frontend/src/components/exam/ExamDashboard.tsx`）：
- ✅ 整合 `CheckInButton` 組件
- ✅ 在 active 狀態的考試卡片中顯示報到按鈕

**ExamRunner.tsx**（`frontend/src/components/exam/ExamRunner.tsx`）：
- ✅ 開始考試前檢查報到狀態
- ✅ 未報到時顯示錯誤提示並導向考試中心

#### 報到統計與 QRcode（`frontend/src/components/admin/TrainingPlanManager.tsx`）

**已實作**：
- ✅ 在計畫列表中顯示報到統計欄位
- ✅ 點擊「報到統計」按鈕顯示詳細統計模態框
- ✅ 統計模態框中顯示：
  - 應到/實到人數、出席率（統計卡片）
  - 應到人數設定（手動修改 + 自動計算）
  - 已報到用戶列表（含報到時間）
  - 未報到用戶列表
  - **報到 QRcode 生成與顯示**
- ✅ 報到 QRcode 複製連結功能

---

## 📝 使用方式

### Admin 產生登入 QRcode

1. 進入「系統管理」→「QRcode 登入管理」
2. 點擊「產生 QRcode」按鈕
3. 系統會生成一個 QRcode 圖片（有效期 24 小時）
4. 可以複製登入連結或直接使用 QRcode 圖片
5. 在 Token 歷史記錄中可以：
   - 查看所有產生的 token
   - 點擊眼睛圖標重新顯示 QRcode
   - 點擊垃圾桶圖標刪除 token

### 用戶使用登入 QRcode

1. 用手機掃描 QRcode 或點擊登入連結
2. 進入 QRcode 登入頁面
3. 輸入員工編號
4. 輸入驗證碼（點擊驗證碼圖片可刷新）
5. 點擊「確認登入」
6. 登入成功後自動跳轉至首頁

**注意**：同一個 QRcode 可以被多人同時使用，每個人都需要輸入自己的員工編號和驗證碼。

### 用戶報到

**方式一：透過考試中心報到**
1. 登入系統後進入「考試中心」
2. 找到需要報到的訓練計畫（狀態為「進行中」）
3. 點擊「立即報到」按鈕
4. 確認報到後完成報到流程
5. 報到成功後可以開始考試

**方式二：掃描報到 QRcode**
1. Admin 或訓練計畫管理者在「訓練計畫管理」中產生報到 QRcode
2. 用戶掃描 QRcode 或點擊報到連結
3. 進入報到頁面，顯示訓練計畫資訊
4. 點擊「確認報到」按鈕
5. 報到成功後可選擇開始考試或返回考試中心

### Admin/訓練計畫管理者查看報到統計

1. 進入「訓練計畫管理」
2. 找到要查看的訓練計畫
3. 點擊「報到統計」按鈕（顯示實到/應到人數）
4. 在統計模態框中可以：
   - 查看詳細統計資訊（應到/實到/出席率）
   - 手動修改應到人數
   - 自動計算應到人數（根據受課部門）
   - 查看已報到/未報到用戶列表
   - 產生報到 QRcode

---

## ✅ 驗收條件

### 登入 QRcode
- [x] Admin 可在系統管理中產生登入 QRcode
- [x] QRcode 包含動態 token，非固定 URL
- [x] 掃描 QRcode 後進入登入頁面
- [x] 登入頁面顯示驗證碼輸入欄位
- [x] 登入時需要輸入員工編號和驗證碼
- [x] Token 有過期機制（24 小時）
- [x] **同一個 QRcode 可以被多人同時使用**（只檢查過期）
- [x] Token 歷史記錄中可顯示/重新生成 QRcode
- [x] 可以手動刪除 Token
- [x] 複製連結功能正常運作

### 報到功能
- [x] 用戶在考試中心選擇訓練計畫後，可執行報到
- [x] 已報到過的訓練計畫不會重複報到
- [x] 報到記錄包含日期時間和 IP 地址
- [x] 未報到無法開始考試（或提示先報到）
- [x] 報到統計正確顯示應到/實到人數
- [x] 可手動修改應到人數
- [x] 可自動計算應到人數（根據受課部門）
- [x] 報到統計顯示已報到/未報到用戶列表
- [x] 報到 QRcode 可正確生成並掃描

### 權限控制
- [x] 只有 Admin 可以產生登入 QRcode
- [x] Admin 和「訓練計劃」角色可以產生報到 QRcode
- [x] Admin 和「訓練計劃」角色可以查看報到統計

---

## 🚀 技術細節

### QRcode 生成
- 使用 Python 套件：`qrcode[pil]`
- Token 格式：UUID v4
- QRcode 內容：`{base_url}/auth/login/qrcode/{token}` 或 `{base_url}/checkin?plan_id={plan_id}`
- 圖片格式：Base64 編碼的 PNG 圖片

### 動態 URL 生成
- 優先使用環境變數 `FRONTEND_URL`（適合生產環境配置）
- 其次使用前端通過 `X-Frontend-URL` header 傳遞的 URL
- 再次從 `Referer` 或 `Origin` header 中提取
- 最後推斷（開發環境假設前端在 5173 端口）

### Token 安全性
- Token 過期時間：24 小時
- Token 允許多人使用：只檢查是否過期，不檢查 is_used
- 登入仍需驗證碼：保持安全性
- 可選：記錄首次使用時間（用於統計）

### 報到邏輯
- 檢查重複報到：查詢 `AttendanceRecord` 是否存在相同 `emp_id` + `plan_id`
- 檢查計畫有效性：`training_date <= today <= end_date`
- 檢查用戶權限：用戶部門需在 `target_departments` 中
- 記錄 IP 地址：可選，用於審計

### 應到人數計算
- 預設：統計 `target_departments` 中所有部門的 `users` 總數（status = "active"）
- 手動修改：允許管理員在 `TrainingPlanManager` 中手動設定
- 自動計算：點擊「自動計算」按鈕根據當前受課部門重新計算

---

## 🔄 未來擴充（可選）

- [ ] Token 使用次數統計（追蹤有多少人使用了同一個 QRcode）
- [ ] 報到 QRcode 過期時間設定（不同於登入 QRcode）
- [ ] 報到通知功能（報到成功後發送通知）
- [ ] 報到統計導出功能（Excel/PDF）
- [ ] 報到記錄批量管理
- [ ] QRcode 掃描記錄（記錄誰掃描了 QRcode，但不一定登入）

---

## 📂 相關檔案

### 後端
- `backend/app/models.py` - 新增模型（AttendanceRecord, LoginToken, TrainingPlan.expected_attendance）
- `backend/app/routers/qrcode.py` - 登入 QRcode API（新建）
- `backend/app/routers/auth.py` - QRcode 登入驗證與登入 API
- `backend/app/routers/exam_center.py` - 報到功能 API
- `backend/app/routers/training.py` - 報到統計與報到 QRcode API
- `backend/app/schemas.py` - 新增 Schema（AttendanceRecord, LoginToken, QRCodeGenerateResponse, AttendanceStats, CheckInQRCodeResponse）

### 前端
- `frontend/src/components/admin/QRCodeManager.tsx` - QRcode 管理介面（新建）
- `frontend/src/components/QRCodeLoginPage.tsx` - QRcode 登入頁面（新建/更新）
- `frontend/src/components/exam/CheckInButton.tsx` - 報到按鈕組件（新建）
- `frontend/src/components/exam/CheckInPage.tsx` - 報到頁面（新建）
- `frontend/src/components/exam/ExamDashboard.tsx` - 整合報到功能（更新）
- `frontend/src/components/exam/ExamRunner.tsx` - 檢查報到狀態（更新）
- `frontend/src/components/admin/TrainingPlanManager.tsx` - 報到統計與 QRcode（更新）
- `frontend/src/App.tsx` - 路由配置（更新）

### 資料庫遷移
- `backend/migrate_qrcode_and_attendance.py` - 資料庫遷移腳本（如需要）

---

**最後更新**：2026-01-10  
**負責人**：開發團隊
