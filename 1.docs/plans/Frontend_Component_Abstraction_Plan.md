# 前端通用元件抽離與重構計畫

## 1. 目的
本文件旨在記錄前端專案中可抽離為通用元件（Shared Components）的功能模組，以提升代碼重用性、統一 UI 視覺風格，並降低維護成本。這些元件設計目標為跨專案通用。

## 2. 識別出的通用元件清單

經過分析 `TrainingPlanManager.tsx`, `ExamStudio.tsx` 等主要檔案，識別出以下四大類可重構元件：

### 2.1. 基礎 UI 元件 (Basic UI Elements)
這些是最小單位的元件，用於統一 Design System。

*   **Button (通用按鈕)**
    *   **現狀**：重複使用 `className="px-4 py-2 bg-indigo-600 text-white rounded-xl..."`。
    *   **建議規格**：`<Button variant="primary|secondary|danger" size="sm|md|lg" isLoading={boolean} {...props} />`
    *   **效益**：集中管理按鈕樣式（圓角、陰影、互動狀態）。

*   **Card / Panel (卡片容器)**
    *   **現狀**：重複使用 `bg-white rounded-2xl shadow-sm border border-indigo-100`。
    *   **建議規格**：`<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>`。
    *   **效益**：統一區塊容器的陰影與邊框風格。

*   **Badge / Tag (狀態標籤)**
    *   **現狀**：散落在 `ExamStudio`（題型標籤）與列表頁（狀態燈號）。
    *   **建議規格**：`<Badge variant="success|warning|error|info">Content</Badge>`。

### 2.2. 交互功能元件 (Interactive Components)

*   **Modal (通用模態視窗)**
    *   **現狀**：各功能（如 `QuestionEditorModal`, `BankImportModal`）自行實作遮罩與定位邏輯。
    *   **建議規格**：建立 `<Modal isOpen onClose title size="sm|md|lg|full">` 基底元件。
    *   **效益**：統一處理 Overlay、動畫、鍵盤 ESC 關閉、Body Scroll 鎖定等邏輯。
    *   **備註**：`ConfirmModal` 已存在且實作良好，可作為參考標準。

### 2.3. 資料呈現元件 (Data Display)

*   **DataTable (數據表格)**
    *   **現狀**：在 `TrainingPlanManager` 等管理頁面中，手寫 `<table>` 結構與迴圈邏輯，重複性高。
    *   **建議規格**：
        ```tsx
        <DataTable
            columns={[
                { header: '標題', accessor: 'title' },
                { header: '操作', accessor: (row) => <Button...> }
            ]}
            data={data}
            keyField="id"
            isLoading={loading}
        />
        ```
    *   **效益**：封裝排序、篩選、空資料顯示、Loading 狀態等邏輯。

*   **LoadingSpinner (載入指示器)**
    *   **現狀**：多處手寫 `<Loader2 className="animate-spin" />`。
    *   **建議規格**：`<LoadingSpinner size="sm|md|lg" fullScreen={boolean} />`。

*   **Pagination (分頁器)**
    *   **狀態**：**已完成** (`components/common/Pagination.tsx`)。
    *   **評價**：功能完整（含頁碼輸入、每頁筆數切換），可作為標準元件範本。

### 2.4. 表單與輸入 (Forms & Inputs)

*   **Input / Select / Textarea (表單控制項)**
    *   **現狀**：表單中充滿重複的 Tailwind CSS class 與錯誤訊息顯示邏輯。
    *   **建議規格**：`<Input label="標題" error="錯誤訊息" {...props} />`。
    *   **效益**：自動處理 Label 排版、必填星號、錯誤樣式（紅框+文字）。

*   **FileUploader (檔案上傳)**
    *   **現狀**：`ExamStudio` 包含複雜的 Drag & Drop 邏輯。
    *   **建議規格**：`<FileDropzone onFileSelect={(files) => ...} accept=".txt,.pdf" maxFiles={1} />`。

*   **SearchBar (搜尋列)**
    *   **現狀**：Icon + Input 的組合重複出現。
    *   **建議規格**：`<SearchBar onSearch={(val) => ...} placeholder="..." />`。

## 3. 建議實作優先級

1.  **DataTable**：管理後台最核心元件，重構後能大幅減少程式碼行數。
2.  **Input/Select**：表單頁面通用，提升開發表單速度。
3.  **Modal**：統一對話框體驗。
4.  **Button/Card**：基礎視覺統一。

## 4. 範例代碼 (DataTable)

```tsx
interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  width?: string;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  isLoading?: boolean;
  emptyMessage?: string;
}

export const DataTable = <T,>({ data, columns, keyField, isLoading, emptyMessage = "無資料" }: DataTableProps<T>) => {
  if (isLoading) return <LoadingSpinner />;
  if (data.length === 0) return <div className="p-8 text-center text-gray-400">{emptyMessage}</div>;

  return (
    <div className="overflow-x-auto rounded-xl border border-indigo-100">
      <table className="w-full">
        <thead className="bg-indigo-50/50">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={`px-4 py-3 text-left text-sm font-bold text-gray-600 ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.map((row) => (
            <tr key={String(row[keyField])} className="hover:bg-indigo-50/30 transition-colors">
              {columns.map((col, idx) => (
                <td key={idx} className="px-4 py-3 text-sm text-gray-700">
                  {typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```
