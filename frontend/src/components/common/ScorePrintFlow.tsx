import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PrintModeTriState, SignatureTriState } from '../personal/printTriState';

export interface ScorePrintPlanOption {
  plan_id: number;
  plan_title: string;
  training_date?: string | null;
  year?: string | null;
  dept_name?: string | null;
  display_index?: number;
}

/** 考試歷程 Modal 底部：詢問2／3 三態與主鈕（由 PlanHistoryModal 傳入） */
export interface PlanHistoryPrintTriProps {
  printMode: PrintModeTriState;
  onPrintModeChange: (m: PrintModeTriState) => void;
  signature: SignatureTriState;
  onSignatureChange: (s: SignatureTriState) => void;
}

export interface ScorePrintFlowProps {
  /** 歷程 Modal 底部：步驟條＋詢問1～3、主鈕「列印考試歷程」；管理端 full 為完整列印流程 */
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
  /** variant=planHistoryFooter 時傳入：詢問2／3 三態（否則沿用舊單選，僅相容用） */
  planHistoryTri?: PlanHistoryPrintTriProps;
  /**
   * 考試歷程精靈：每次此數值變化時重設至步驟 1（例如父層在 Modal 每次開啟時遞增）。
   */
  planHistoryWizardResetSignal?: number;
  /**
   * 若 true，禁用「考卷成績單(individual)」列印方式單選框（例如成績資料模式為「考試歷程」時，
   * individual 為無效組合）。預設 false（不禁用），不影響既有呼叫端行為。
   */
  disableIndividualMode?: boolean;
}

/**
 * T13：成績列印共用流程（full：先選訓練計畫 → 列印方式 → 簽名／歷程；歷程 footer 另有三態步驟）
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
  planHistoryTri,
  planHistoryWizardResetSignal = 0,
  disableIndividualMode = false,
}: ScorePrintFlowProps) {
  const isPlanHistoryFooter = variant === 'planHistoryFooter';
  const usePlanHistoryWizard = isPlanHistoryFooter && planHistoryTri !== undefined;
  const [planHistoryStep, setPlanHistoryStep] = useState<1 | 2 | 3>(1);
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

  useEffect(() => {
    if (usePlanHistoryWizard) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlanHistoryStep(1);
    }
  }, [usePlanHistoryWizard, planHistoryWizardResetSignal]);

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

  const printDisabledBase =
    printLoading ||
    selectedPlanIds.size === 0 ||
    (requireEmployeeSelectionForPrint && selectedEmployeeCount === 0);

  const printDisabled = usePlanHistoryWizard
    ? printDisabledBase ||
      planHistoryTri.printMode === 'unset' ||
      planHistoryTri.signature === 'unset'
    : printDisabledBase;

  const listLabel = isPlanHistoryFooter ? '列印個人成績清單' : '列印成績清單';
  const individualLabel = isPlanHistoryFooter ? '列印個人考卷成績' : '列印每個人的考卷成績';

  const phListLabel = '列印個人所有考試歷程成績清單';
  const phIndividualLabel = '列印個人所有考試歷程的每一次考卷成績';

  const getPlanHistoryStepVisual = (stepNum: 1 | 2 | 3): 'done' | 'active' | 'todo' => {
    if (planHistoryStep === stepNum) return 'active';
    if (planHistoryStep > stepNum) return 'done';
    return 'todo';
  };

  const renderPlanHistoryStepCircle = (stepNum: 1 | 2 | 3, title: string) => {
    const v = getPlanHistoryStepVisual(stepNum);
    const circleClass =
      v === 'todo'
        ? 'bg-gray-200 text-gray-500 border border-gray-300'
        : 'bg-blue-600 text-white border border-blue-600 shadow-sm';
    const labelClass =
      v === 'active'
        ? 'text-blue-600 font-bold'
        : v === 'done'
          ? 'text-gray-600 font-semibold'
          : 'text-gray-400';
    return (
      <div
        className="flex w-[3.75rem] shrink-0 flex-col items-center text-center sm:w-20"
        role="listitem"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black sm:h-9 sm:w-9 sm:text-sm ${circleClass}`}
          aria-current={v === 'active' ? 'step' : undefined}
        >
          {stepNum}
        </span>
        <span className={`mt-1 w-full text-[9px] leading-tight sm:text-xs ${labelClass}`}>{title}</span>
      </div>
    );
  };

  const planHistoryStepConnector = (
    <div
      className="mx-0.5 flex min-w-0 flex-1 items-center"
      role="presentation"
      aria-hidden
    >
      <div className="h-0.5 min-w-[2px] flex-1 bg-gray-200" />
      <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} />
      <div className="h-0.5 min-w-[2px] flex-1 bg-gray-200" />
    </div>
  );

  const showPlanBlock = !usePlanHistoryWizard || planHistoryStep === 1;

  return (
    <div className="space-y-4">
      {usePlanHistoryWizard && (
        <div
          className="flex w-full max-w-2xl mx-auto items-center gap-0 px-0.5 py-2"
          role="list"
          aria-label="列印步驟"
        >
          {renderPlanHistoryStepCircle(1, '訓練計畫')}
          {planHistoryStepConnector}
          {renderPlanHistoryStepCircle(2, '列印方式')}
          {planHistoryStepConnector}
          {renderPlanHistoryStepCircle(3, '員工簽名')}
        </div>
      )}

      {/* 詢問1：訓練計畫（下拉勾選） */}
      {showPlanBlock && (
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
                      {plan.display_index != null && (
                        <span className="w-6 shrink-0 text-center text-xs text-gray-400 tabular-nums">
                          {plan.display_index}
                        </span>
                      )}
                      {plan.year && (
                        <span className="w-12 shrink-0 text-xs text-indigo-600 tabular-nums">{plan.year}</span>
                      )}
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

        {usePlanHistoryWizard && planHistoryStep === 1 && (
          <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setPlanHistoryStep(2)}
              disabled={selectedPlanIds.size === 0}
              className="w-full min-[400px]:w-auto rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:min-w-[8rem]"
            >
              下一步
            </button>
          </div>
        )}
      </div>
      )}

      {usePlanHistoryWizard && planHistoryTri ? (
        <>
          {planHistoryStep === 2 && (
            <>
              <div className="border border-indigo-100 rounded-xl p-4">
                <h4 className="text-sm font-black text-gray-800 mb-2">詢問2：列印方式</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="plan_history_print_mode"
                      checked={planHistoryTri.printMode === 'list'}
                      onChange={() => planHistoryTri.onPrintModeChange('list')}
                    />
                    {phListLabel}
                  </label>
                  {/* T13（約 245 行）：暫隱藏「每一次考卷成績」；保留 radio 以免狀態型別與精靈驗證需大改 */}
                  <label className="hidden text-sm font-bold text-gray-700 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="plan_history_print_mode"
                        checked={planHistoryTri.printMode === 'individual'}
                        onChange={() => planHistoryTri.onPrintModeChange('individual')}
                      />
                      {phIndividualLabel}
                    </span>
                  </label>
                </div>
                {planHistoryTri.printMode === 'unset' && (
                  <p className="text-xs text-gray-400 mt-2">請擇一列印方式</p>
                )}
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:justify-end min-[400px]:gap-3">
                <button
                  type="button"
                  onClick={() => setPlanHistoryStep(1)}
                  className="order-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 min-[400px]:order-1"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={() => setPlanHistoryStep(3)}
                  disabled={planHistoryTri.printMode === 'unset'}
                  className="order-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 min-[400px]:order-2"
                >
                  下一步
                </button>
              </div>
            </>
          )}

          {planHistoryStep === 3 && (
            <>
              <div className="border border-indigo-100 rounded-xl p-4">
                <h4 className="text-sm font-black text-gray-800 mb-2">詢問3：列印員工簽名</h4>
                <div className="space-y-2" role="radiogroup" aria-label="列印員工簽名">
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="plan_history_signature"
                      checked={planHistoryTri.signature === 'no'}
                      onChange={() => planHistoryTri.onSignatureChange('no')}
                    />
                    否
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="plan_history_signature"
                      checked={planHistoryTri.signature === 'yes'}
                      onChange={() => planHistoryTri.onSignatureChange('yes')}
                    />
                    是
                  </label>
                </div>
                {planHistoryTri.signature === 'unset' && (
                  <p className="text-xs text-gray-400 mt-2">請選擇是否列印簽名</p>
                )}
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:justify-end min-[400px]:gap-3">
                <button
                  type="button"
                  onClick={() => setPlanHistoryStep(2)}
                  className="order-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 min-[400px]:order-1"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={onPrintPdf}
                  disabled={printDisabled}
                  className="order-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 min-[400px]:order-2"
                >
                  {printLoading ? '產生中...' : '列印考試歷程'}
                </button>
              </div>
            </>
          )}
        </>
      ) : isPlanHistoryFooter ? (
        <>
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
              <label
                className={`flex items-center gap-2 text-sm font-bold cursor-pointer ${
                  disableIndividualMode ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="score_print_mode"
                  checked={printMode === 'individual'}
                  onChange={() => onPrintModeChange('individual')}
                  disabled={disableIndividualMode}
                />
                {individualLabel}
              </label>
            </div>
          </div>
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
        </>
      ) : (
        <>
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
              <label
                className={`flex items-center gap-2 text-sm font-bold cursor-pointer ${
                  disableIndividualMode ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="score_print_mode"
                  checked={printMode === 'individual'}
                  onChange={() => onPrintModeChange('individual')}
                  disabled={disableIndividualMode}
                />
                {individualLabel}
              </label>
            </div>
          </div>
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
        </>
      )}
    </div>
  );
}
