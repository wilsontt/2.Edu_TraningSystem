import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ScorePrintPlanOption {
  plan_id: number;
  plan_title: string;
  training_date?: string | null;
}

export interface ScorePrintFlowProps {
  /** 歷程 Modal 底部：僅詢問1+2（個人文案）、單一「產生 PDF」出口，無簽名／歷程與預覽 */
  variant?: 'full' | 'planHistoryFooter';
  planOptions: ScorePrintPlanOption[];
  selectedPlanIds: Set<number>;
  onSelectedPlanIdsChange: (next: Set<number>) => void;
  printMode: 'list' | 'individual';
  onPrintModeChange: (m: 'list' | 'individual') => void;
  includeEmployeeSignature: boolean;
  onIncludeEmployeeSignatureChange: (v: boolean) => void;
  includeExamHistory: boolean;
  onIncludeExamHistoryChange: (v: boolean) => void;
  onLoadPreview: () => void;
  onPrintPdf: () => void;
  printLoading: boolean;
  /** 列印 PDF 按鈕旁顯示的已選人數（去重員工）；個人端可省略或傳 1 */
  selectedEmployeeCount?: number;
  /** 若 true，未選人員時禁用列印 PDF（管理端預覽表勾選） */
  requireEmployeeSelectionForPrint?: boolean;
}

/**
 * T13：成績列印共用流程（順序：先選訓練計畫 → 列印方式 → 簽名／歷程，預設皆否）
 */
export default function ScorePrintFlow({
  variant = 'full',
  planOptions,
  selectedPlanIds,
  onSelectedPlanIdsChange,
  printMode,
  onPrintModeChange,
  includeEmployeeSignature,
  onIncludeEmployeeSignatureChange,
  includeExamHistory,
  onIncludeExamHistoryChange,
  onLoadPreview,
  onPrintPdf,
  printLoading,
  selectedEmployeeCount = 0,
  requireEmployeeSelectionForPrint = false,
}: ScorePrintFlowProps) {
  const isPlanHistoryFooter = variant === 'planHistoryFooter';
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [planSearch, setPlanSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPlanMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filteredPlans = planOptions.filter((p) =>
    (p.plan_title || '').toLowerCase().includes(planSearch.trim().toLowerCase())
  );

  const togglePlan = (planId: number) => {
    const next = new Set(selectedPlanIds);
    if (next.has(planId)) next.delete(planId);
    else next.add(planId);
    onSelectedPlanIdsChange(next);
  };

  const selectAllPlans = () => {
    onSelectedPlanIdsChange(new Set(planOptions.map((p) => p.plan_id)));
  };

  const clearAllPlans = () => {
    onSelectedPlanIdsChange(new Set());
  };

  const printDisabled =
    printLoading ||
    selectedPlanIds.size === 0 ||
    (requireEmployeeSelectionForPrint && selectedEmployeeCount === 0);

  const listLabel = isPlanHistoryFooter ? '列印個人成績清單' : '列印成績清單';
  const individualLabel = isPlanHistoryFooter ? '列印個人考卷成績' : '列印每個人的考卷成績';

  return (
    <div className="space-y-4">
      {/* 詢問1：訓練計畫（下拉勾選） */}
      <div className="border border-indigo-100 rounded-xl p-4">
        <h4 className="text-sm font-black text-gray-800 mb-2">詢問1：選擇訓練計畫（下拉勾選，至少一項）</h4>
        <div className="relative" ref={wrapRef}>
          <button
            type="button"
            onClick={() => setPlanMenuOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-bold border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
          >
            <span className="truncate text-gray-800">
              已選 {selectedPlanIds.size} 項計畫
              {selectedPlanIds.size === 0 ? '（請選擇）' : ''}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition ${planMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {planMenuOpen && (
            <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-72 flex flex-col">
              <div className="p-2 border-b border-gray-100 flex gap-2">
                <input
                  type="search"
                  placeholder="搜尋計畫名稱…"
                  value={planSearch}
                  onChange={(e) => setPlanSearch(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded px-2 py-1"
                />
                <button
                  type="button"
                  onClick={selectAllPlans}
                  className="text-xs font-bold px-2 py-1 border border-indigo-200 text-indigo-600 rounded hover:bg-indigo-50"
                >
                  全選
                </button>
                <button
                  type="button"
                  onClick={clearAllPlans}
                  className="text-xs font-bold px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-50"
                >
                  清除
                </button>
              </div>
              <div className="overflow-y-auto p-2 space-y-1">
                {filteredPlans.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-4 text-center">沒有符合的計畫</p>
                ) : (
                  filteredPlans.map((plan) => (
                    <label
                      key={plan.plan_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm font-bold text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlanIds.has(plan.plan_id)}
                        onChange={() => togglePlan(plan.plan_id)}
                      />
                      <span className="truncate">{plan.plan_title}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {planOptions.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">尚無可列印訓練計畫</p>
        )}
      </div>

      {/* 詢問2：列印方式 */}
      <div className="border border-indigo-100 rounded-xl p-4">
        <h4 className="text-sm font-black text-gray-800 mb-2">詢問2：列印方式</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="score_print_mode"
              checked={printMode === 'list'}
              onChange={() => onPrintModeChange('list')}
            />
            {listLabel}
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="score_print_mode"
              checked={printMode === 'individual'}
              onChange={() => onPrintModeChange('individual')}
            />
            {individualLabel}
          </label>
        </div>
      </div>

      {isPlanHistoryFooter ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onPrintPdf}
            disabled={printDisabled}
            className="px-4 py-2 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
          >
            {printLoading ? '產生中...' : '產生 PDF'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeEmployeeSignature}
              onChange={(e) => onIncludeEmployeeSignatureChange(e.target.checked)}
            />
            列印員工簽名（預設否）
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeExamHistory}
              onChange={(e) => onIncludeExamHistoryChange(e.target.checked)}
            />
            列印考試歷程（預設否）
          </label>
          <button
            type="button"
            onClick={onLoadPreview}
            disabled={printLoading || selectedPlanIds.size === 0}
            className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed"
          >
            {printLoading ? '載入中...' : '載入預覽'}
          </button>
          <button
            type="button"
            onClick={onPrintPdf}
            disabled={printDisabled}
            title="括號數字為「已勾選要列印的員工人數（去重）」，不是預覽列筆數"
            className="px-4 py-2 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
          >
            列印 PDF（已選 {selectedEmployeeCount} 人）
          </button>
        </div>
      )}
    </div>
  );
}
