import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  /** 當前頁碼（從 1 開始） */
  currentPage: number;
  /** 總頁數 */
  totalPages: number;
  /** 每頁顯示筆數 */
  pageSize: number;
  /** 總筆數 */
  totalItems: number;
  /** 頁碼變更回調 */
  onPageChange: (page: number) => void;
  /** 每頁筆數變更回調 */
  onPageSizeChange: (size: number) => void;
  /** 每頁筆數選項，預設 [10, 20, 50] */
  pageSizeOptions?: number[];
  /** 是否顯示每頁筆數選擇器，預設 true */
  showPageSizeSelector?: boolean;
  /** 是否顯示總筆數，預設 true */
  showTotalItems?: boolean;
  /** 自定義樣式類名 */
  className?: string;
}

/**
 * 通用分頁元件
 * 
 * 功能：
 * - 上一頁/下一頁按鈕
 * - 頁碼輸入（支援直接輸入跳頁）
 * - 每頁筆數選擇
 * - 總筆數顯示
 * 
 * @example
 * <Pagination
 *   currentPage={currentPage}
 *   totalPages={totalPages}
 *   pageSize={pageSize}
 *   totalItems={totalItems}
 *   onPageChange={(page) => setCurrentPage(page)}
 *   onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
 * />
 */
const Pagination = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  showPageSizeSelector = true,
  showTotalItems = true,
  className = ''
}: PaginationProps) => {
  const [pageInput, setPageInput] = useState('');

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setPageInput('');
    } else {
      setPageInput('');
    }
  };

  const handlePageInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setPageInput(currentPage.toString());
    e.target.select();
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  // 如果沒有資料，不顯示分頁
  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={`border-t border-indigo-100 bg-gradient-to-r from-indigo-50/30 to-white px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      {/* 左側：每頁筆數選擇 + 總筆數 */}
      <div className="flex items-center gap-3">
        {showPageSizeSelector && (
          <>
            <span className="text-sm text-gray-600 font-medium">每頁顯示：</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-3 py-1.5 border border-indigo-200 rounded-lg bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer transition-all duration-200"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </>
        )}
        {showTotalItems && (
          <span className="text-sm text-indigo-600 font-medium">
            共 {totalItems} 筆
          </span>
        )}
      </div>

      {/* 右側：分頁導航 */}
      <div className="flex items-center gap-2">
        {/* 上一頁 */}
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className="p-2 rounded-lg border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
          title="上一頁"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* 頁碼輸入 */}
        <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
          <span className="text-sm text-gray-600 font-medium">第</span>
          <input
            type="text"
            value={pageInput !== '' ? pageInput : currentPage}
            onChange={handlePageInputChange}
            onBlur={handlePageInputSubmit}
            onFocus={handlePageInputFocus}
            className="w-12 px-2 py-1 text-center border border-indigo-200 rounded-lg bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
          />
          <span className="text-sm text-gray-600 font-medium">頁 / 共 {totalPages} 頁</span>
        </form>

        {/* 下一頁 */}
        <button
          onClick={handleNextPage}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
          title="下一頁"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
