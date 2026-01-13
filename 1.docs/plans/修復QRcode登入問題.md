# 修復 QRcode 登入問題

**建立日期**: 2026-01-13  
**狀態**: 待實作

## 問題概述

1. **移除「使用時間」欄位**：`used_at` 欄位目前沒有實際用途，因為系統允許同一 QRcode 被多人使用，單一使用時間意義不大
2. **隱藏已過期 Token（保留最近 5 筆）**：已過期的 Token 在歷史記錄中沒有實際用途（沒有記錄哪個用戶使用了哪個 token），應該隱藏大部分，但保留最近 5 筆以供參考
3. **修復 QRcode 登入 Bug**：後端 `login_with_qrcode` 函數缺少 `joinedload` 預載入關聯資料，可能導致 `AttributeError` 和登入失敗
4. **修復時區問題**：系統中沒有統一設定時區，後端使用 UTC 時間但前端解析時可能視為本地時間，導致顯示時間不正確

## 問題分析

### 問題1：使用時間欄位無用

**現況**：
- 資料庫 `LoginToken` 表有 `used_at` 欄位（`models.py` 第 165 行）
- 後端 Schema `LoginToken` 包含 `used_at`（`schemas.py` 第 245 行）
- 前端 `LoginToken` interface 包含 `used_at`（`QRCodeManager.tsx` 第 19 行）
- 前端表格顯示「使用時間」欄位（`QRCodeManager.tsx` 第 295、318 行）
- 前端狀態判斷使用 `used_at`（`QRCodeManager.tsx` 第 332 行）

**問題**：
- 系統允許同一 QRcode 被多人使用，`used_at` 只記錄第一次使用時間，意義不大
- 後端登入成功時也沒有更新 `used_at`（`auth.py` 第 340-342 行被註解）

### 問題2：已過期 Token 無用

**現況**：
- 前端顯示所有 Token，包括已過期的（`QRCodeManager.tsx` 第 301 行）
- 已過期的 Token 仍可查看 QRcode（如果未過期時保存的）
- 沒有記錄哪個用戶使用了哪個 Token

**問題**：
- 已過期的 Token 沒有實際用途，應該隱藏大部分以保持列表簡潔
- 但保留最近 5 筆已過期的 Token 以供參考（例如查看最近產生的 Token）

### 問題3：QRcode 登入 Bug

**現況**：
- 後端 `login_with_qrcode` 函數（`auth.py` 第 333 行）查詢 user 時沒有使用 `joinedload` 預載入關聯資料
- 返回 user 物件時（第 355-357 行）嘗試訪問 `user.department.name` 和 `user.role.functions`，如果關聯資料沒有被載入，會導致 `AttributeError`
- 對比一般的 `login` 函數（第 193-196 行），它正確使用了 `joinedload`

**問題**：
- 當 `user.department` 或 `user.role` 為 None 時，訪問 `.name` 或 `.functions` 會拋出 `AttributeError`
- FastAPI 捕獲錯誤返回 500，前端顯示錯誤訊息
- 但實際上 JWT token 可能已經生成，只是返回時出錯
- 如果前端在錯誤發生前已經保存了 token，用戶按返回首頁時就能登入（因為 localStorage 中已有 token）

### 問題4：時區不一致

**現況**：
- 後端使用 `datetime.utcnow()` 儲存 UTC 時間到資料庫（`models.py` 第 163 行，`qrcode.py` 第 48 行）
- 後端有些地方使用 `datetime.now()`（本地時間），有些地方使用 `datetime.utcnow()`（UTC 時間），不一致
- FastAPI 序列化 datetime 時，可能返回沒有時區資訊的字串（例如 `"2026-01-13T10:23:17"` 沒有 'Z' 後綴）
- 前端使用 `toLocaleString('zh-TW')` 格式化時間，但沒有明確指定時區（`QRCodeManager.tsx` 第 124-133 行）

**問題**：
- 後端儲存 UTC 時間（例如 `2026-01-13 10:23:17 UTC`）
- 後端返回時可能沒有時區資訊（例如 `"2026-01-13T10:23:17"`）
- 前端 `new Date(dateString)` 解析時，如果字串沒有時區資訊，JavaScript 會將其視為本地時間（台灣 UTC+8）
- 導致顯示時間錯誤：應該顯示 `2026-01-13 18:23:17`（UTC+8），但顯示為 `2026-01-13 10:23:17`（錯誤）
- 系統中時區使用不一致，可能導致其他時間顯示也有問題

## 修復計劃

### 修復1：移除「使用時間」欄位

**檔案1**：`frontend/src/components/admin/QRCodeManager.tsx`

**修改內容**：
1. 移除 `LoginToken` interface 中的 `used_at` 欄位（第 19 行）
2. 移除表格表頭中的「使用時間」欄位（第 295 行）
3. 移除表格內容中顯示 `used_at` 的 `<td>`（第 317-319 行）
4. 移除狀態判斷中使用 `used_at` 的邏輯（第 332 行）

**檔案2**：`backend/app/schemas.py`

**修改內容**：
1. 移除 `LoginToken` schema 中的 `used_at` 欄位（第 245 行）

**注意**：
- 資料庫 `models.py` 中的 `used_at` 欄位暫時保留（不刪除資料庫欄位，避免遷移問題）
- 如果未來需要統計使用次數，可以新增 `use_count` 欄位

### 修復2：隱藏已過期 Token（保留最近 5 筆）

**檔案**：`frontend/src/components/admin/QRCodeManager.tsx`

**修改內容**：
1. 在 `fetchTokens` 後，分離未過期和已過期的 token
2. 使用 `isExpired` 函數（已存在，第 126-128 行）來判斷是否過期
3. 已過期的 token 按過期時間排序，只保留最近 5 筆
4. 合併未過期的 token 和最近 5 筆已過期的 token

**實作方式**：

```typescript
// 在 fetchTokens 函數中，載入後處理
const res = await api.get<LoginToken[]>('/admin/qrcode/login/tokens');
const validTokens = res.data.filter(token => !isExpired(token.expires_at));
const expiredTokens = res.data.filter(token => isExpired(token.expires_at));

// 已過期的 token 按過期時間排序（最新的在前），只取前 5 筆
const recentExpiredTokens = expiredTokens
  .sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())
  .slice(0, 5);

// 合併：未過期的全部 + 最近 5 筆已過期的
setTokens([...validTokens, ...recentExpiredTokens]);
```

**邏輯說明**：
- 未過期的 Token：全部顯示
- 已過期的 Token：按過期時間排序（最近過期的在前），只顯示最近 5 筆
- 排序依據：`expires_at`（過期時間），最新的在前

### 修復3：修復 QRcode 登入 Bug

**檔案**：`backend/app/routers/auth.py`

**修改內容**：
1. 在 `login_with_qrcode` 函數中（第 333 行），修改 user 查詢，加入 `joinedload` 預載入關聯資料
2. 與一般 `login` 函數（第 193-196 行）保持一致

**修改前**：

```python
user = db.query(models.User).filter(models.User.emp_id == req.emp_id).first()
```

**修改後**：

```python
user = db.query(models.User).options(
    joinedload(models.User.department),
    joinedload(models.User.role).joinedload(models.Role.functions)
).filter(models.User.emp_id == req.emp_id).first()
```

**影響**：
- 確保 `user.department` 和 `user.role.functions` 被正確載入
- 避免在返回 user 物件時出現 `AttributeError`
- 與一般登入函數保持一致

### 修復4：修復時區問題

**方案選擇**：後端統一使用 UTC，前端明確轉換為台灣時區（推薦）

**優點**：
- 資料庫統一儲存 UTC，避免時區混亂
- 前端根據用戶時區顯示，符合最佳實踐
- 跨時區部署時更穩定

**檔案1**：`frontend/src/components/admin/QRCodeManager.tsx`

**修改內容**：
1. 修改 `formatDateTime` 函數，明確處理 UTC 時間轉換

**修改前**：

```typescript
const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};
```

**修改後**：

```typescript
const formatDateTime = (dateString: string) => {
    // 如果字串沒有時區資訊，加上 'Z' 表示 UTC
    const utcString = dateString.endsWith('Z') ? dateString : dateString + 'Z';
    const date = new Date(utcString);
    
    return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Taipei' // 明確指定台灣時區
    });
};
```

**邏輯說明**：
- 如果後端返回的時間字串沒有 'Z' 後綴（表示 UTC），自動加上 'Z'
- 使用 `new Date(utcString)` 正確解析 UTC 時間
- 使用 `timeZone: 'Asia/Taipei'` 明確指定轉換為台灣時區（UTC+8）

**檔案2**：`frontend/src/components/QRCodeLoginPage.tsx`

**修改內容**：
1. 同樣修改時間格式化邏輯（如果有的話）

**注意**：
- 此修復主要針對 QRcode 相關的時間顯示
- 如果系統中其他地方的時間顯示也有問題，建議統一修復
- 後端暫時不修改，保持使用 UTC 時間儲存（這是正確的做法）

## 實作步驟

### 步驟1：移除前端「使用時間」欄位

1. 修改 `frontend/src/components/admin/QRCodeManager.tsx`：
   - 移除 interface 中的 `used_at`
   - 移除表格表頭和內容中的「使用時間」欄位
   - 移除狀態判斷中使用 `used_at` 的邏輯

### 步驟2：移除後端 Schema 中的 `used_at`

1. 修改 `backend/app/schemas.py`：
   - 移除 `LoginToken` schema 中的 `used_at` 欄位

### 步驟3：隱藏已過期 Token（保留最近 5 筆）

1. 修改 `frontend/src/components/admin/QRCodeManager.tsx`：
   - 在 `fetchTokens` 函數中分離未過期和已過期的 token
   - 已過期的 token 按過期時間排序，只保留最近 5 筆
   - 合併未過期的 token 和最近 5 筆已過期的 token

### 步驟4：修復後端登入 Bug

1. 修改 `backend/app/routers/auth.py`：
   - 在 `login_with_qrcode` 函數中加入 `joinedload` 預載入
   - 確保與一般 `login` 函數保持一致

### 步驟5：修復時區問題

1. 修改 `frontend/src/components/admin/QRCodeManager.tsx`：
   - 修改 `formatDateTime` 函數，明確處理 UTC 時間轉換
   - 如果時間字串沒有 'Z' 後綴，自動加上 'Z' 表示 UTC
   - 使用 `timeZone: 'Asia/Taipei'` 明確指定台灣時區

2. 檢查並修改 `frontend/src/components/QRCodeLoginPage.tsx`：
   - 如果也有時間格式化，使用相同的邏輯

## 測試要點

1. **移除使用時間欄位**：
   - 確認前端表格不再顯示「使用時間」欄位
   - 確認後端 API 返回的資料不包含 `used_at`
   - 確認沒有 TypeScript 或運行時錯誤

2. **隱藏已過期 Token（保留最近 5 筆）**：
   - 確認未過期的 Token 全部顯示
   - 確認已過期的 Token 只顯示最近 5 筆（按過期時間排序，最新的在前）
   - 確認超過 5 筆的已過期 Token 被隱藏
   - 確認重新整理後，邏輯仍然正確

3. **修復登入 Bug**：
   - 測試 QRcode 登入功能，確認不再出現錯誤訊息
   - 確認登入成功後能正常進入系統
   - 測試不同用戶（有/無部門、有/無角色）的登入情況
   - 確認後端返回的 `user` 物件格式正確

4. **修復時區問題**：
   - 確認 QRcode 建立時間顯示正確（UTC 時間轉換為台灣時區 UTC+8）
   - 確認 QRcode 過期時間顯示正確
   - 確認 Token 歷史記錄中的建立時間和過期時間顯示正確
   - 測試：產生 QRcode 後，檢查顯示時間是否為台灣時間（UTC+8）
   - 例如：UTC 時間 `2026-01-13 10:23:17` 應該顯示為 `2026/01/13 下午06:23:17`（台灣時間）

## 檔案清單

### 需要修改的檔案

1. `frontend/src/components/admin/QRCodeManager.tsx`
   - 移除 `used_at` 相關程式碼
   - 過濾已過期的 token（保留最近 5 筆）
   - 修復 `formatDateTime` 函數，明確處理 UTC 時間轉換

2. `backend/app/schemas.py`
   - 移除 `LoginToken` schema 中的 `used_at` 欄位

3. `backend/app/routers/auth.py`
   - 在 `login_with_qrcode` 函數中加入 `joinedload` 預載入

4. `frontend/src/components/QRCodeLoginPage.tsx`（可選）
   - 檢查並修復時間格式化邏輯（如果有的話）

### 不需要修改的檔案

- `backend/app/models.py`：資料庫模型中的 `used_at` 欄位暫時保留（避免資料庫遷移問題）

## 注意事項

1. **資料庫欄位保留**：`models.py` 中的 `used_at` 欄位暫時保留，不刪除資料庫欄位，避免遷移問題。如果未來需要統計使用次數，可以新增 `use_count` 欄位。

2. **向後相容**：移除 `used_at` 後，如果後端仍返回 `used_at`，前端會忽略（因為 interface 中已移除）。

3. **過期 Token 處理**：在前端過濾，保留最近 5 筆已過期的 Token。如果選擇在後端過濾，需要修改 `backend/app/routers/qrcode.py` 的 `get_login_tokens` 函數。目前計劃在前端過濾，更簡單且不影響其他可能使用該 API 的地方。已過期的 Token 按過期時間排序（最新的在前），只顯示最近 5 筆。

4. **登入 Bug 修復**：修復後，確保所有用戶（包括沒有部門或角色的用戶）都能正常登入。

5. **時區問題修復**：
   - 後端統一使用 UTC 時間儲存（這是正確的做法，不需要修改）
   - 前端明確處理 UTC 時間轉換為台灣時區（UTC+8）
   - 如果後端返回的時間字串沒有時區資訊，前端自動加上 'Z' 表示 UTC
   - 使用 `timeZone: 'Asia/Taipei'` 明確指定台灣時區，確保顯示時間正確
   - 此修復主要針對 QRcode 相關的時間顯示，如果系統中其他地方的時間顯示也有問題，建議統一修復
