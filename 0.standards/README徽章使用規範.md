# README 徽章使用規範 (Badge Usage Standard)

**文件版本**: v1.0.0  
**建立日期**: 2025-11-28  
**最近修訂**: 2025-11-28  
**依據**: 
- `0.專案憲章-總規範-SDD工作流程/1.專案憲章 Project Constitution.md` (v2.3.0) - **最高優先**
- `0.專案憲章-總規範-SDD工作流程/3.規格驅動開發 (SDD) 工作流程.md` (v1.1.0)
- `0.專案憲章-總規範-SDD工作流程/2.文件倉儲管理系統 Warehouse Management System 設計規範v2.0.md`

---

## 1. 目的

本規範定義專案中所有 README.md 檔案使用徽章（Badges）的標準，確保：
- **一致性**: 所有 README 使用統一的徽章風格與格式
- **資訊性**: 徽章能快速傳達專案關鍵資訊
- **可維護性**: 徽章格式易於更新與維護

---

## 2. 規範優先順序

本規範**必須**與以下規範一併遵循，優先順序如下：

1. **專案憲章** (最高優先)
   - P5: 所有 README 必須使用**正體中文 (zh-TW)** 撰寫
   - P14: 所有 README.md 必須遵循本規範的格式與結構要求

2. **SDD 工作流程**
   - 文件結構需遵循 7 大項規範（目的、範圍、權責...）
   - 文件命名需符合規範

3. **設計規範**
   - 技術堆疊說明需符合設計規範定義
   - UI/UX 相關說明需符合設計規範

4. **本規範 (README 徽章使用規範)**
   - 徽章格式、排列、顏色等格式規範

---

## 3. 適用範圍

### 3.1 根目錄 README.md
- **必須遵循**: 專案憲章 P5 (正體中文)
- **必須遵循**: 專案憲章 P14 (文件產出規範)
- **必須遵循**: 本規範的徽章格式
- **建議遵循**: SDD 工作流程的文件結構規範

### 3.2 子專案 README.md (frontend/backend)
- **必須遵循**: 專案憲章 P5 (正體中文)
- **必須遵循**: 專案憲章 P14 (文件產出規範)
- **必須遵循**: 設計規範的技術堆疊說明
- **必須遵循**: 本規範的徽章格式（僅顯示該子專案的技術）
- **建議遵循**: SDD 工作流程的文件結構規範

### 3.3 模組 README.md (1.specs/2.plans/docs/...)
- **必須遵循**: 專案憲章 P5 (正體中文)
- **必須遵循**: 專案憲章 P14 (文件產出規範)
- **必須遵循**: SDD 工作流程的文件結構規範
- **可選遵循**: 本規範的徽章格式（若需要）

---

## 4. 徽章分類

### 4.1 專案狀態徽章 (Project Status Badges)

**必備徽章**:
- 版本號 (Version)
- 專案狀態 (Status)

**格式範例**:
```markdown
![版本](https://img.shields.io/badge/版本-{版本號}-blue)
![狀態](https://img.shields.io/badge/狀態-{狀態}-{顏色})
```

**狀態值**:
- `開發中` (yellow)
- `測試中` (orange)
- `穩定版` (green)
- `維護中` (blue)
- `已棄用` (red)

### 4.2 技術堆疊徽章 (Technology Stack Badges)

**必備徽章**（根目錄 README）:
- React
- TypeScript
- .NET
- SQL Server

**格式範例**:
```markdown
![React](https://img.shields.io/badge/React-{版本}+-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-{版本}+-3178C6?logo=typescript&logoColor=white)
```

**子專案徽章**:
- `frontend/README.md`: 僅顯示前端技術（React, TypeScript, Tailwind）
- `backend/README.md`: 僅顯示後端技術（.NET, SQL Server, Entity Framework）

### 4.3 品質指標徽章 (Quality Metrics Badges)

**可選徽章**:
- 建置狀態 (Build Status)
- 測試覆蓋率 (Test Coverage)
- 程式碼品質 (Code Quality)
- 文件狀態 (Documentation Status)

**格式範例**:
```markdown
![建置狀態](https://img.shields.io/badge/建置-{狀態}-{顏色})
![測試覆蓋率](https://img.shields.io/badge/測試覆蓋率-{百分比}%25-{顏色})
```

### 4.4 授權與聯絡徽章 (License & Contact Badges)

**格式範例**:
```markdown
![授權](https://img.shields.io/badge/授權-{授權類型}-lightgrey)
```

---

## 5. 徽章排列規範

### 5.1 排列順序

徽章應按照以下順序排列：

1. **專案狀態徽章**（版本、狀態）
2. **授權徽章**（如有）
3. **技術堆疊徽章**（依重要性排序）
4. **品質指標徽章**（建置、測試、文件）

### 5.2 排列格式

**單行排列**（推薦，適合徽章數量 < 8）:
```markdown
![版本](...) ![狀態](...) ![React](...) ![TypeScript](...)
```

**多行排列**（適合徽章數量 ≥ 8）:
```markdown
![版本](...) ![狀態](...) ![授權](...)

![React](...) ![TypeScript](...) ![.NET](...) ![SQL Server](...)

![建置狀態](...) ![測試覆蓋率](...) ![文件狀態](...)
```

---

## 6. 顏色規範

### 6.1 狀態顏色

| 狀態 | 顏色代碼 | 說明 |
|------|---------|------|
| 成功/通過 | `success` 或 `green` | 建置成功、測試通過 |
| 警告/進行中 | `yellow` 或 `orange` | 開發中、測試中 |
| 錯誤/失敗 | `red` | 建置失敗、測試失敗 |
| 資訊 | `blue` | 版本號、文件狀態 |
| 中性 | `lightgrey` | 授權、待定項目 |

### 6.2 技術堆疊顏色

使用各技術的官方品牌色：
- React: `61DAFB`
- TypeScript: `3178C6`
- .NET: `512BD4`
- SQL Server: `CC2927`
- Tailwind CSS: `38B2AC`
- Vite: `646CFF`

---

## 7. 動態徽章 (Dynamic Badges)

### 7.1 CI/CD 建置狀態

如果專案有 CI/CD 流程，可使用動態徽章：

```markdown
![建置狀態](https://github.com/{username}/{repo}/workflows/{workflow}/badge.svg)
```

### 7.2 測試覆蓋率

如果使用測試覆蓋率工具（如 Codecov）：

```markdown
![測試覆蓋率](https://codecov.io/gh/{username}/{repo}/branch/{branch}/graph/badge.svg)
```

---

## 8. 檔案位置規範

### 8.1 根目錄 README.md

**必備徽章**:
- 版本號
- 專案狀態
- 主要技術堆疊（React, TypeScript, .NET, SQL Server）

**可選徽章**:
- 授權
- 建置狀態
- 測試覆蓋率

### 8.2 子專案 README.md

**frontend/README.md**:
- React 版本
- TypeScript 版本
- Tailwind CSS
- Vite

**backend/README.md**:
- .NET 版本
- SQL Server 版本
- Entity Framework Core

---

## 9. 更新規範

### 9.1 版本號更新

當專案版本更新時，**必須**同步更新：
1. README.md 中的版本徽章
2. `package.json` 或 `.csproj` 中的版本號
3. 相關規格文件中的版本號

### 9.2 狀態更新

專案狀態變更時（如：從「開發中」改為「穩定版」），**必須**更新狀態徽章。

---

## 10. 範例範本

### 10.1 根目錄 README.md 範本

```markdown
# 文件倉儲管理系統 (Warehouse Management System)

![版本](https://img.shields.io/badge/版本-2.0.0-blue)
![狀態](https://img.shields.io/badge/狀態-開發中-yellow)
![授權](https://img.shields.io/badge/授權-待定-lightgrey)

![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-2022-CC2927?logo=microsoft-sql-server&logoColor=white)

![建置狀態](https://img.shields.io/badge/建置-通過-success)
![測試覆蓋率](https://img.shields.io/badge/測試覆蓋率-80%25-green)
![文件狀態](https://img.shields.io/badge/文件-完整-blue)
```

### 10.2 子專案 README.md 範本

**frontend/README.md**:
```markdown
# 前端專案 (Frontend)

![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.0+-38B2AC?logo=tailwind-css&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?logo=vite&logoColor=white)
```

**backend/README.md**:
```markdown
# 後端專案 (Backend)

![.NET](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet&logoColor=white)
![C#](https://img.shields.io/badge/C%23-12-239120?logo=c-sharp&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-2022-CC2927?logo=microsoft-sql-server&logoColor=white)
![Entity Framework](https://img.shields.io/badge/Entity%20Framework-Core-512BD4?logo=dotnet&logoColor=white)
```

---

## 11. 工具與資源

### 11.1 徽章生成工具

- **Shields.io**: https://shields.io/
- **Badgen**: https://badgen.net/

### 11.2 常用徽章範例

可在 Shields.io 的網站上自訂徽章，或使用以下格式：

```
https://img.shields.io/badge/{左側文字}-{右側文字}-{顏色}?logo={logo名稱}&logoColor={logo顏色}
```

---

## 12. 檢查清單

建立或更新 README.md 時，請確認：

- [ ] 版本號徽章已更新
- [ ] 專案狀態徽章正確
- [ ] 技術堆疊徽章與實際使用的版本一致
- [ ] 徽章排列符合規範
- [ ] 顏色使用符合規範
- [ ] 所有徽章連結可正常顯示
- [ ] 文件內容使用正體中文 (zh-TW)
- [ ] 文件結構符合 P14 規範

---

**文件版本**: v1.0.0  
**下一步**: 更新根目錄與子專案的 README.md，套用本規範

