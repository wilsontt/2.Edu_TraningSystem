# 報到統計 Modal／清單共用抽取 — 實作計劃 (PLAN)

**文件類型**：棕地實作計劃  
**建立日期**：2026-07-23  
**狀態**：📋 **待審**（草案；待對齊 Q1～Q5 後再開 TASKS／實作）  
**前置 PLAN**：[20260722_合併報到未到原因與歷程時間軸_PLAN.md](20260722_合併報到未到原因與歷程時間軸_PLAN.md)（Q11 一鍵填寫＝搜尋後名單；Out of Scope 曾寫「不強制抽共用」）  
**觸發原因**：同一「報到統計」UX 在報到總覽與訓練計畫各刻一份；後續改動（例如一鍵填寫吃搜尋）只打到其中一處，行為分叉。

> **本 PLAN 範圍**：限**本專案** `frontend/src` 內抽取與對齊；可**沿用**既有 `@shared-ui/data-table`（組織共用、本專案教材庫等已使用），**不**為此功能改 `0.shared-ui` 套件本體。

---

## 1. 目的

1. **行為單一來源**：報到總覽與訓練計畫的「報到統計」在卡片篩選、搜尋、分頁、一鍵填寫名單上**語意一致**，避免再出現「一邊改了、另一邊漏」。
2. **規則先於 UI**：優先抽出純函式（清單建構／搜尋／批次名單），讓契約可單測；UI 再漸進共用。
3. **可控重構**：分階段交付；允許訓練計畫維持較精簡功能（無歷程／無內嵌 QR），以旗標區隔，不強迫一次對齊所有能力。
4. **沿用既有共用**：分頁用既有 `Pagination` 或（若審核同意）本專案已導入之 `PaginatedDataTable`；原因選項與 `ABSENCE_REASON_LABELS` 合併為單一來源。

---

## 2. 範圍

### 2.1 涵蓋（In Scope）

| Phase | 摘要 |
|-------|------|
| **A 純規則** | 新增 `frontend/src/utils/attendanceStatsList.ts`（或等價路徑）：filter 型別、build／filter／bulk／paginate、原因選項 SSOT |
| **B UI 小積木** | `frontend/src/components/attendance/` 下抽出 FilterCards、ListSearch；（可選）人員表列／表頭 |
| **C 整顆 Modal**（審核後） | `AttendanceStatsModal`：兩邊改為掛載同一元件；父層注入 stats／readOnly／旗標／callbacks |
| **D 表格策略**（審核後） | D1 維持手寫 table＋`Pagination`，或 D2 改用 `@shared-ui/data-table` 之 `PaginatedDataTable` |
| **E 回歸** | 兩邊入口驗收同一契約；必要時補純函式單元測試（Jest／vitest 若無則以小型 TS 測試或 pytest 無關時改為手測＋契約文件） |
| **F 文件** | 本 PLAN 核准後 TASKS；結案更新棕地總覽／交付索引 |

### 2.2 不涵蓋（Out of Scope）

| 項目 | 說明 |
|------|------|
| 合併報到紀錄列表／合併大 Modal | 僅總覽有，非雙入口重複；本波不抽 |
| 合併「各場」摘要表 | 同上 |
| 訓練計畫 CRUD／教材區 | 與報到統計無關 |
| 修改 `0.shared-ui` 套件原始碼 | 僅消費既有 `@shared-ui/data-table` API |
| 後端 API／schema 變更 | 本波純前端結構／行為對齊（除非驗收發現契約缺口另開 PLAN） |
| 強制訓練計畫補齊「歷程」「參與合併批次」 | 預設以旗標維持精簡；若 Q3 選「對齊」再納入 TASKS |

### 2.3 審核決策（待確認 — 請勾選／修改）

| # | 提案 | 預設建議 | 請確認 |
|---|------|----------|--------|
| Q1 | 本波實作深度 | **A＋B**（規則＋卡片／搜尋）；C 整顆 Modal 可同 sprint 或下一波 | ☐ A only　☐ **A+B（建議）**　☐ A+B+C |
| Q2 | 人員表是否改 DataTable | **D1 先手寫**＋既有 `Pagination`；項次／分頁契約寫死；穩定後再開 D2 | ☐ **D1（建議）**　☐ 本波即 D2 `PaginatedDataTable` |
| Q3 | 歷程／QR／曾參與合併 | Modal **旗標**：總覽開、訓練計畫關（維持現況能力差） | ☐ **旗標維持差（建議）**　☐ 訓練計畫對齊總覽能力 |
| Q4 | 表頭「項次」文案 | 人員表統一 **「項次」**（合併未到／批次 Modal 已用）；舊「ITEM」一併改 | ☐ **項次（建議）**　☐ 維持 ITEM　☐ 兩邊可不同 |
| Q5 | 原因選項 SSOT | `ABSENCE_REASON_OPTIONS` 與 `utils/attendanceCheckinEventLabel.ts` 之 `ABSENCE_REASON_LABELS` **合併單一模組**；`BulkAbsenceReasonModal`／兩頁改 import | ☐ **合併（建議）**　☐ 暫只抽 OPTIONS 常數檔 |

---

## 3. 權責

| 角色 | 責任 |
|------|------|
| 產品／審核 | 確認 Q1～Q5；確認「行為契約」是否寫入驗收 |
| 開發 | PLAN 核准後開 TASKS；依 Phase 實作、自測兩邊入口、更新主控文件 |
| 使用者／驗收 | 報到總覽與訓練計畫各跑一輪：未到卡＋搜尋＋一鍵填寫名單語意一致 |

---

## 4. 名詞解釋

| 名詞 | 定義 |
|------|------|
| **單計畫報到統計 Modal** | 「報到統計 - {計畫名}」：4 卡、搜尋、人員表、單人／批次填未到原因；（總覽可）內嵌 QR、歷程、曾參與合併 |
| **卡片 filter** | `expected`／`actual`／`absent`／`leave` 四態之一 |
| **搜尋後名單** | 卡片 filter 之後，再以關鍵字過濾 emp_id／name／dept_name 的結果 |
| **一鍵填寫名單** | 傳入 `BulkAbsenceReasonModal` 的 `users`；契約＝**搜尋後名單**，且僅在 `absent`／`leave` |
| **行為契約** | 見 §5.2；兩邊入口必須遵守的篩選／分頁／批次規則 |
| **旗標** | `AttendanceStatsModal` props 如 `showHistory`、`showQr`、`showParticipatedBatches`、`openedFromBatch` |
| **D1／D2** | 表格實作策略：手寫 table vs `PaginatedDataTable` |

---

## 5. 作業內容

### 5.1 現況盤點（As-Is）

| 項目 | 報到總覽 `AttendanceOverviewPage` | 訓練計畫 `TrainingPlanManager` |
|------|-----------------------------------|--------------------------------|
| 4 卡＋搜尋＋分頁 | 有（預設 pageSize 5，>5 顯示分頁） | 有（同概念，程式重複） |
| 一鍵填寫吃搜尋 | 有（`bulkAbsenceUsersFromStats`） | 有（已對齊，但仍重複實作） |
| 歷程展開 | 有 | **無** |
| 內嵌 QR／`openedFromBatch` | 有 | QR 另 Modal；統計 Modal 無此旗標 |
| 曾參與合併報到 | 有 | **無** |
| `ABSENCE_REASON_OPTIONS` | 檔內常數 | 檔內常數（第三份在 `BulkAbsenceReasonModal`） |
| 人員表 | 手寫 table；表頭「ITEM」 | 手寫 table；表頭「ITEM」 |
| 已共用 | `BulkAbsenceReasonModal`、`Pagination`、`attendanceCheckinEventLabel`（歷程文案） | 同左 |

**已知風險**：任何只改其中一頁的 UX／契約變更，會再次分叉。

### 5.2 行為契約（Must；抽共用後兩邊強制）

1. 清單管線：`stats` → **卡片 filter** → **搜尋** → **分頁**。
2. **一鍵填寫 `users`**＝步驟 1 之「搜尋後名單」（不是整卡全量、也不是僅當頁）。
3. 僅 `absent`／`leave` 顯示一鍵填寫；搜尋後 0 人 → 按鈕 **disabled**。
4. 預設每頁 **5**；**總筆數 >5** 才顯示分頁 UI。
5. 項次跨頁連續：`startIndex + idx + 1`。
6. 原因代碼／標籤 **單一來源**（Q5）。

### 5.3 建議檔案落點（To-Be）

```text
frontend/src/
  utils/
    attendanceStatsList.ts          # Phase A：純規則 + 原因 OPTIONS（或 re-export）
    attendanceCheckinEventLabel.ts  # 既有；與 OPTIONS 合併或互相引用（Q5）
  components/attendance/
    BulkAbsenceReasonModal.tsx      # 既有；改 import OPTIONS
    AttendanceFilterCards.tsx       # Phase B
    AttendanceListSearch.tsx        # Phase B
    AttendanceStatsModal.tsx        # Phase C（若 Q1 含 C）
    AttendanceOverviewPage.tsx      # 改為消費共用
  components/admin/
    TrainingPlanManager.tsx         # 改為消費共用
  components/common/
    Pagination.tsx                  # D1 繼續用
```

若 Q2＝D2：人員表改 `import { PaginatedDataTable } from '@shared-ui/data-table'`（參考 `MaterialMastersManager.tsx`）；`indexColumnHeader` 依 Q4。

### 5.4 Phase 作業細則

#### Phase A — 純規則

- 匯出至少：
  - `AttendanceListFilter`
  - `buildAttendanceList(stats, filter)`
  - `filterAttendanceList(list, keyword)`
  - `toBulkAbsenceUsers(filtered, filter)`（或等價名）
  - `paginateSlice(list, page, pageSize)`／`shouldShowPagination(total, threshold=5)`
  - `ABSENCE_REASON_OPTIONS`（Q5）
- 兩邊既有 `useMemo` 改呼叫上述函式；**行為不變**為完成條件（含已對齊之搜尋→一鍵填寫）。

#### Phase B — UI 小積木

- `AttendanceFilterCards`：應到／實到／未到／請假；接收 counts、`value`、`onChange`；可選 `compact`（總覽 QR 並排時）。
- `AttendanceListSearch`：placeholder 與現況一致。
- （可選）抽出表頭／列渲染，降低 C 的 diff。

#### Phase C — 整顆 Modal（Q1 含 C 時）

- Props 草案：

```ts
type AttendanceStatsModalProps = {
  open: boolean;
  planId: number;
  planTitle: string;
  stats: AttendanceStats; // 型別可抽至 types 或 utils
  readOnly: boolean;
  showQr?: boolean;
  openedFromBatch?: boolean;
  showHistory?: boolean;
  showParticipatedBatches?: boolean;
  onClose: () => void;
  onStatsUpdated: (stats: AttendanceStats) => void;
  onPrint?: () => void;
  onGenerateQr?: () => void;
  // 單人／批次 API 可由 Modal 內呼叫或由父層注入 onSaveAbsence / onBulkAbsence
};
```

- `TrainingPlanManager`／`AttendanceOverviewPage` 刪除重複 Modal JSX；保留頁面專屬狀態（計畫列表、合併 batch 等）。

#### Phase D — 表格策略

- **D1**：維持手寫；統一項次文案（Q4）；繼續 `Pagination`。
- **D2**：`PaginatedDataTable`；注意「歷程展開列」需確認 shared-ui 是否支援 row expansion；若不支援則歷程列維持手寫或僅總覽保留自訂 tbody。

#### Phase E — 驗收

| # | 案例 | 期望 |
|---|------|------|
| V1 | 總覽：未到卡＋搜尋關鍵字＋一鍵填寫 | Modal 名單＝搜尋結果 |
| V2 | 訓練計畫：同上 | 與 V1 語意相同 |
| V3 | 搜尋無結果 | 一鍵填寫 disabled |
| V4 | 名單 >5 | 出現分頁；項次跨頁連續 |
| V5 | 實到卡 | 不顯示一鍵填寫 |
| V6 |（若有 C）合併入口開統計 | 無「顯示 QRCode」（既有 Q10）仍成立 |

### 5.5 建議實作順序

```text
核准 Q1～Q5
  → Phase A（規則＋兩邊改呼叫）→ 手測 V1～V5
  → Phase B（卡片／搜尋）→ 手測
  →（若 Q1 含 C）Phase C → 手測 V1～V6
  →（若 Q2＝D2）Phase D2 → 手測分頁／項次
  → 文件結案
```

### 5.6 風險與緩解

| 風險 | 緩解 |
|------|------|
| 一次抽整顆 Modal diff 過大 | Q1 預設 A+B；C 可拆 PR |
| DataTable 難做歷程展開 | Q2 預設 D1；D2 時總覽歷程可例外 |
| 型別 `AttendanceStats` 兩邊各定義 | Phase A／C 抽到 `types` 或 utils 共用 interface |
| 前端無單元測試框架 | Phase A 以手動雙入口契約為主；可選極小純函式測試若專案後續加 vitest |

---

## 6. 參考文件

| 文件 | 用途 |
|------|------|
| [20260722_合併報到未到原因與歷程時間軸_PLAN.md](20260722_合併報到未到原因與歷程時間軸_PLAN.md) | Q11 契約；原 Out of Scope「不強制抽共用」 |
| [20260713_成員與報到清單搜尋及訓練計畫報到分頁.md](../交付實作文件/20260713_成員與報到清單搜尋及訓練計畫報到分頁.md) | 早期分頁／搜尋對齊脈絡 |
| [0.shared-ui/data-table/README.md](../../../../0.shared-ui/data-table/README.md) | `PaginatedDataTable`／ITEM 序號（Q2＝D2 時） |
| `frontend/src/components/attendance/AttendanceOverviewPage.tsx` | 總覽現況 |
| `frontend/src/components/admin/TrainingPlanManager.tsx` | 訓練計畫現況 |
| `frontend/src/components/attendance/BulkAbsenceReasonModal.tsx` | 已共用批次 Modal |
| `frontend/src/utils/attendanceCheckinEventLabel.ts` | 原因標籤／歷程文案 |

---

## 7. 使用表單（欄位說明）

本波**無**新增業務表單或 DB 欄位。以下為共用元件／函式之介面欄位（實作時對齊）：

| 名稱 | 類型 | 說明 |
|------|------|------|
| `filter` | `expected` \| `actual` \| `absent` \| `leave` | 卡片狀態 |
| `keyword` | `string` | 搜尋字串；trim 後小寫比對 emp_id／name／dept_name |
| `page` / `pageSize` | `number` | 分頁；預設 `pageSize=5` |
| `users[].emp_id` / `name` / `dept_name` | `string` | 一鍵填寫傳入 `BulkAbsenceReasonModal` |
| `showHistory` | `boolean` | 是否顯示歷程欄與展開 |
| `showQr` / `openedFromBatch` | `boolean` | 是否顯示 QR 區／合併入口隱藏 QR 鈕 |
| `showParticipatedBatches` | `boolean` | 是否顯示「曾參與合併報到」 |
| `readOnly` | `boolean` | 封存等：不可編輯未到原因 |
| `indexColumnHeader` | `string` | D2 時項次表頭；建議「項次」 |

---

## 8. 實作檢查清單（核准後勾選）

- [ ] Q1～Q5 已勾選確認
- [ ] TASKS 已建立並連結本 PLAN
- [ ] Phase A 完成；V1～V5 通過
- [ ] Phase B 完成（若 Q1⊇B）
- [ ] Phase C 完成（若 Q1⊇C）
- [ ] Phase D2 完成（若 Q2＝D2）
- [ ] 主控文件（README／棕地總覽／交付索引）已更新

---

**最後更新**：2026-07-23（草案待審）
