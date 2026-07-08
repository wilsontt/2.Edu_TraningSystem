/**
 * 成績中心｜批次列印（管理端跨人員功能）
 * 四步精靈：1 篩選（計畫狀態／訓練計畫／部門）→ 2 列印類型 → 3 人員預覽勾選 → 4 產出。
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Printer } from 'lucide-react';
import clsx from 'clsx';
import Pagination from '../common/Pagination';
import {
  useBatchPrint,
  BATCH_PRINT_INDIVIDUAL_WARN_THRESHOLD,
  type PlanStatus,
} from '../../hooks/useBatchPrint';

const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  active: '進行中',
  expired: '已過期',
  archived: '已封存',
};

const PREVIEW_PAGE_SIZE = 10;

export default function BatchPrintPage() {
  const {
    selectedPlanIds,
    setSelectedPlanIds,
    selectedDeptIds,
    setSelectedDeptIds,
    planStatus,
    setPlanStatus,
    scoreDataMode,
    setScoreDataMode,
    printMode,
    setPrintMode,
    outputStyle,
    setOutputStyle,
    includeEmployeeSignature,
    setIncludeEmployeeSignature,
    selectedEmpIds,
    setSelectedEmpIds,
    toggleEmpId,
    previewItems,
    previewTotal,
    deptOptions,
    planOptions,
    loading,
    error,
    setError,
    fetchDeptOptions,
    fetchPlanOptions,
    loadPreview,
    exportByOutputStyle,
  } = useBatchPrint();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewSearch, setPreviewSearch] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [hasLoadedPreviewOnce, setHasLoadedPreviewOnce] = useState(false);

  useEffect(() => {
    fetchDeptOptions().catch(() => setError('載入部門清單失敗'));
  }, [fetchDeptOptions, setError]);

  useEffect(() => {
    fetchPlanOptions(planStatus).catch(() => setError('載入訓練計畫清單失敗'));
  }, [planStatus, fetchPlanOptions, setError]);

  const togglePlanId = (planId: number) => {
    const next = new Set(selectedPlanIds);
    if (next.has(planId)) next.delete(planId);
    else next.add(planId);
    setSelectedPlanIds(next);
  };

  const toggleDeptId = (deptId: number) => {
    const next = new Set(selectedDeptIds);
    if (next.has(deptId)) next.delete(deptId);
    else next.add(deptId);
    setSelectedDeptIds(next);
  };

  const handlePlanStatusChange = (status: PlanStatus) => {
    setPlanStatus(status);
    setSelectedPlanIds(new Set());
    setPlanSearch('');
  };

  const selectAllPlans = () => {
    setSelectedPlanIds(new Set(filteredPlanOptions.map((p) => p.plan_id)));
  };

  const clearAllPlans = () => {
    setSelectedPlanIds(new Set());
  };

  const selectAllDepts = () => {
    setSelectedDeptIds(new Set(deptOptions.map((d) => d.dept_id)));
  };

  const clearAllDepts = () => {
    setSelectedDeptIds(new Set());
  };

  const individualDisabled = scoreDataMode === 'exam_history';
  const showOutputStyleChoice = scoreDataMode === 'last_attempt';
  const useScoreCardOutput = showOutputStyleChoice && outputStyle === 'score_card';

  useEffect(() => {
    if (individualDisabled && printMode === 'individual') {
      setPrintMode('list');
    }
    if (individualDisabled) {
      setOutputStyle('summary_list');
    }
  }, [individualDisabled, printMode, setPrintMode, setOutputStyle]);

  const filteredPlanOptions = (() => {
    const term = planSearch.trim().toLowerCase();
    if (!term) return planOptions;
    return planOptions.filter(
      (p) =>
        (p.plan_title || '').toLowerCase().includes(term) ||
        (p.year || '').toLowerCase().includes(term) ||
        (p.dept_name || '').toLowerCase().includes(term),
    );
  })();

  const filteredPreviewItems = (() => {
    const term = previewSearch.trim().toLowerCase();
    if (!term) return previewItems;
    return previewItems.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.emp_id.toLowerCase().includes(term) ||
        item.dept_name.toLowerCase().includes(term),
    );
  })();

  const previewTotalPages = Math.max(1, Math.ceil(filteredPreviewItems.length / PREVIEW_PAGE_SIZE));
  const paginatedPreviewItems = filteredPreviewItems.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE,
  );

  const allFilteredSelected =
    filteredPreviewItems.length > 0 &&
    filteredPreviewItems.every((item) => selectedEmpIds.has(item.emp_id));

  const toggleSelectAllFiltered = () => {
    const next = new Set(selectedEmpIds);
    if (allFilteredSelected) {
      filteredPreviewItems.forEach((item) => next.delete(item.emp_id));
    } else {
      filteredPreviewItems.forEach((item) => next.add(item.emp_id));
    }
    setSelectedEmpIds(next);
  };

  const handleLoadPreview = async () => {
    setError('');
    setPreviewPage(1);
    await loadPreview();
    setHasLoadedPreviewOnce(true);
  };

  const handleExport = async () => {
    if (
      (useScoreCardOutput || printMode === 'individual') &&
      selectedEmpIds.size > BATCH_PRINT_INDIVIDUAL_WARN_THRESHOLD &&
      !window.confirm(
        `本次共 ${selectedEmpIds.size} 人，超過 ${BATCH_PRINT_INDIVIDUAL_WARN_THRESHOLD} 人可能產生較大列印，確定繼續？`,
      )
    ) {
      return;
    }
    await exportByOutputStyle();
  };

  const stepLabels: Record<1 | 2 | 3 | 4, string> = {
    1: '篩選',
    2: '列印類型',
    3: '人員',
    4: '產出',
  };

  const stepNext = () => setStep((s) => (Math.min(4, s + 1) as 1 | 2 | 3 | 4));
  const stepBack = () => setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3 | 4));

  const exportButtonLabel = useScoreCardOutput
    ? '列印成績單（逐題詳答）'
    : '產生 PDF';

  const canProceedFromStep3 =
    hasLoadedPreviewOnce && previewItems.length > 0 && !loading;

  return (
    <div className="space-y-6 text-base">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
          <Printer className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">批次列印</h2>
          <p className="text-base text-gray-500">跨部門／跨計畫批次產生成績清單或考卷成績單</p>
        </div>
      </header>

      <div className="flex items-center justify-center gap-1 flex-wrap">
        {([1, 2, 3, 4] as const).map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-black',
                step > s
                  ? 'bg-green-600 text-white'
                  : step === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500',
              )}
            >
              {step > s ? '✓' : s}
            </div>
            <span
              className={clsx(
                'ml-1.5 text-sm font-bold',
                step === s ? 'text-blue-600' : 'text-gray-400',
              )}
            >
              {stepLabels[s]}
            </span>
            {s < 4 && <ChevronRight className="h-4 w-4 text-gray-300 mx-2" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-base text-red-600 font-medium">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(['active', 'expired', 'archived'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handlePlanStatusChange(s)}
                className={clsx(
                  'px-4 py-2 rounded-lg text-base font-bold border transition-colors cursor-pointer',
                  planStatus === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
                )}
              >
                {PLAN_STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="border border-indigo-100 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-base font-black text-gray-800">
                選擇訓練計畫（已選 {selectedPlanIds.size} 項，至少一項）
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllPlans}
                  disabled={filteredPlanOptions.length === 0}
                  className="text-sm font-bold px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-40 cursor-pointer"
                >
                  全選
                </button>
                <button
                  type="button"
                  onClick={clearAllPlans}
                  className="text-sm font-bold px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  清除
                </button>
              </div>
            </div>
            <input
              type="search"
              placeholder="搜尋計畫名稱或年份…"
              value={planSearch}
              onChange={(e) => setPlanSearch(e.target.value)}
              className="w-full mb-3 text-base border border-gray-200 rounded-lg px-3 py-2"
            />
            {planOptions.length === 0 ? (
              <p className="text-base text-gray-400 py-4 text-center">尚無可列印訓練計畫</p>
            ) : filteredPlanOptions.length === 0 ? (
              <p className="text-base text-gray-400 py-4 text-center">無符合搜尋的計畫</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredPlanOptions.map((p) => (
                  <label
                    key={p.plan_id}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-base border cursor-pointer transition-all',
                      selectedPlanIds.has(p.plan_id)
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-black'
                        : 'bg-white border-gray-200 text-gray-700 font-bold hover:border-indigo-300 hover:bg-indigo-50/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlanIds.has(p.plan_id)}
                      onChange={() => togglePlanId(p.plan_id)}
                      className="shrink-0"
                    />
                    <span className="w-8 shrink-0 text-center text-sm font-black text-gray-400 tabular-nums">
                      {p.display_index ?? '—'}
                    </span>
                    <span className="w-14 shrink-0 text-sm font-black text-indigo-600 tabular-nums">
                      {p.year || '—'}
                    </span>
                    <span className="truncate flex-1 min-w-0">{p.plan_title}</span>
                    {p.dept_name && (
                      <span className="hidden sm:inline text-sm text-gray-400 font-normal truncate max-w-28">
                        {p.dept_name}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="border border-indigo-100 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-base font-black text-gray-800">
                選擇部門（不選表示權限範圍內全部部門，已選 {selectedDeptIds.size} 項）
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllDepts}
                  disabled={deptOptions.length === 0}
                  className="text-sm font-bold px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-40 cursor-pointer"
                >
                  全選
                </button>
                <button
                  type="button"
                  onClick={clearAllDepts}
                  className="text-sm font-bold px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  不全選
                </button>
              </div>
            </div>
            {deptOptions.length === 0 ? (
              <p className="text-base text-gray-400 py-4 text-center">尚無可選部門</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {deptOptions.map((d) => (
                  <label
                    key={d.dept_id}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl text-base border cursor-pointer transition-all min-h-11',
                      selectedDeptIds.has(d.dept_id)
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-black'
                        : 'bg-white border-gray-200 text-gray-700 font-bold hover:border-indigo-300 hover:bg-indigo-50/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDeptIds.has(d.dept_id)}
                      onChange={() => toggleDeptId(d.dept_id)}
                      className="shrink-0"
                    />
                    <span className="truncate" title={d.dept_name}>
                      {d.dept_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="border border-indigo-100 rounded-xl p-4">
            <h4 className="text-base font-black text-gray-800 mb-3">成績資料範圍</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-base font-bold text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="score_data_mode"
                  checked={scoreDataMode === 'last_attempt'}
                  onChange={() => setScoreDataMode('last_attempt')}
                />
                最後一次考試成績
              </label>
              <label className="flex items-center gap-2 text-base font-bold text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="score_data_mode"
                  checked={scoreDataMode === 'exam_history'}
                  onChange={() => setScoreDataMode('exam_history')}
                />
                考試歷程
              </label>
            </div>
          </div>

          {showOutputStyleChoice && (
            <div className="border border-indigo-100 rounded-xl p-4">
              <h4 className="text-base font-black text-gray-800 mb-3">輸出結果（最後一次成績）</h4>
              <div className="space-y-3">
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 hover:border-indigo-300 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/50">
                  <input
                    type="radio"
                    name="output_style"
                    checked={outputStyle === 'score_card'}
                    onChange={() => setOutputStyle('score_card')}
                    className="mt-1 shrink-0"
                  />
                  <span>
                    <span className="block text-base font-black text-gray-800">
                      成績單預覽樣式（瀏覽器列印）
                    </span>
                    <span className="block text-sm font-medium text-gray-600 mt-1 leading-relaxed">
                      封面成績摘要＋<strong className="text-gray-800">逐題詳答表格</strong>（每題列出題目、考生答案、正確答案、得分），與個人「成績單預覽」Modal 所見相同。
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 hover:border-indigo-300 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50/50">
                  <input
                    type="radio"
                    name="output_style"
                    checked={outputStyle === 'summary_list'}
                    onChange={() => setOutputStyle('summary_list')}
                    className="mt-1 shrink-0"
                  />
                  <span>
                    <span className="block text-base font-black text-gray-800">
                      成績清單樣式（PDF 下載）
                    </span>
                    <span className="block text-sm font-medium text-gray-600 mt-1 leading-relaxed">
                      多人彙整為成績清單表格；跨部門或跨計畫時打包為 ZIP。不含逐題詳答。
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {!useScoreCardOutput && (
            <div className="border border-indigo-100 rounded-xl p-4">
              <h4 className="text-base font-black text-gray-800 mb-3">列印方式</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-base font-bold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="print_mode"
                    checked={printMode === 'list'}
                    onChange={() => setPrintMode('list')}
                  />
                  成績清單(list)
                </label>
                <label
                  className={clsx(
                    'flex items-center gap-2 text-base font-bold cursor-pointer',
                    individualDisabled ? 'text-gray-400' : 'text-gray-700',
                  )}
                >
                  <input
                    type="radio"
                    name="print_mode"
                    checked={printMode === 'individual'}
                    disabled={individualDisabled}
                    onChange={() => setPrintMode('individual')}
                  />
                  考卷成績單(individual，逐題卡片答題詳情)
                </label>
                {individualDisabled && (
                  <p className="text-sm text-orange-500 font-bold pl-6">
                    「考試歷程」目前僅支援成績清單 PDF
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleLoadPreview}
              disabled={loading || selectedPlanIds.size === 0}
              className="px-4 py-2.5 text-base font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? '載入中...' : '載入預覽'}
            </button>
            {hasLoadedPreviewOnce && (
              <span className="text-base text-gray-500 font-medium">
                共 {previewTotal} 筆，已勾選 {selectedEmpIds.size} 人
              </span>
            )}
          </div>

          {!hasLoadedPreviewOnce && (
            <p className="text-sm text-orange-600 font-bold">
              請先按「載入預覽」取得人員清單後，才能進入下一步。
            </p>
          )}

          {hasLoadedPreviewOnce && (
            <div className="border border-indigo-100 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-gray-100 flex items-center gap-2">
                <input
                  type="search"
                  placeholder="搜尋姓名、員工編號或部門…"
                  value={previewSearch}
                  onChange={(e) => {
                    setPreviewSearch(e.target.value);
                    setPreviewPage(1);
                  }}
                  className="flex-1 text-base border border-gray-200 rounded-lg px-3 py-2"
                />
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="text-sm font-bold px-3 py-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 whitespace-nowrap cursor-pointer"
                >
                  {allFilteredSelected ? '取消全選' : '全選目前清單'}
                </button>
              </div>

              {filteredPreviewItems.length === 0 ? (
                <p className="text-base text-gray-400 py-8 text-center">
                  {previewItems.length === 0 ? '尚無預覽資料，請先載入預覽' : '無符合搜尋條件的資料'}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-base">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-sm font-black text-gray-600 w-10" />
                          <th className="px-3 py-2.5 text-left text-sm font-black text-gray-600">員工編號</th>
                          <th className="px-3 py-2.5 text-left text-sm font-black text-gray-600">姓名</th>
                          <th className="px-3 py-2.5 text-left text-sm font-black text-gray-600">部門</th>
                          <th className="px-3 py-2.5 text-left text-sm font-black text-gray-600">訓練計畫</th>
                          <th className="px-3 py-2.5 text-right text-sm font-black text-gray-600">分數</th>
                          <th className="px-3 py-2.5 text-center text-sm font-black text-gray-600">結果</th>
                          <th className="px-3 py-2.5 text-left text-sm font-black text-gray-600">考試時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPreviewItems.map((item, idx) => (
                          <tr
                            key={`${item.emp_id}-${item.plan_id}-${idx}`}
                            className={clsx(
                              'border-t border-gray-100',
                              idx % 2 === 1 ? 'bg-gray-50' : 'bg-white',
                            )}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={selectedEmpIds.has(item.emp_id)}
                                onChange={() => toggleEmpId(item.emp_id)}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 tabular-nums text-sm">{item.emp_id}</td>
                            <td className="px-3 py-2.5 font-bold text-gray-900">{item.name}</td>
                            <td className="px-3 py-2.5 text-gray-600">{item.dept_name}</td>
                            <td className="px-3 py-2.5 text-gray-600 truncate max-w-48">{item.plan_title}</td>
                            <td className="px-3 py-2.5 text-right">
                              <span
                                className={clsx(
                                  'font-black',
                                  item.is_passed ? 'text-green-600' : 'text-red-500',
                                )}
                              >
                                {item.total_score}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={clsx(
                                  'inline-flex px-2 py-0.5 rounded-full text-sm font-bold',
                                  item.is_passed
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-600',
                                )}
                              >
                                {item.is_passed ? '通過' : '未通過'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-sm tabular-nums">
                              {item.submit_time ? item.submit_time.slice(0, 16).replace('T', ' ') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredPreviewItems.length > PREVIEW_PAGE_SIZE && (
                    <Pagination
                      currentPage={previewPage}
                      totalPages={previewTotalPages}
                      pageSize={PREVIEW_PAGE_SIZE}
                      totalItems={filteredPreviewItems.length}
                      onPageChange={setPreviewPage}
                      onPageSizeChange={() => {}}
                      showPageSizeSelector={false}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="border border-indigo-100 rounded-xl p-4">
            <h4 className="text-base font-black text-gray-800 mb-3">員工簽名</h4>
            <label className="flex items-center gap-2 text-base font-bold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeEmployeeSignature}
                onChange={(e) => setIncludeEmployeeSignature(e.target.checked)}
              />
              列印「考生簽名 / 日期」雙欄
            </label>
          </div>

          <div className="border border-indigo-100 rounded-xl p-4 space-y-2 text-base text-gray-600">
            <p>已選訓練計畫：{selectedPlanIds.size} 項</p>
            <p>已選部門：{selectedDeptIds.size === 0 ? '權限範圍內全部' : `${selectedDeptIds.size} 項`}</p>
            <p>已勾選人員：{selectedEmpIds.size} 人</p>
            <p>
              成績資料範圍：{scoreDataMode === 'last_attempt' ? '最後一次考試成績' : '考試歷程'}
            </p>
            <p>
              輸出：
              {useScoreCardOutput
                ? '成績單預覽樣式（封面＋逐題詳答表格，瀏覽器列印）'
                : printMode === 'list'
                  ? '成績清單 PDF'
                  : '考卷成績單（封面＋逐題卡片答題詳情）'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={loading || selectedPlanIds.size === 0 || selectedEmpIds.size === 0}
            className="w-full sm:w-auto px-5 py-3 text-base font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? '產生中...' : exportButtonLabel}
          </button>
          {!loading && selectedPlanIds.size > 0 && selectedEmpIds.size === 0 && (
            <p className="text-sm text-orange-500 font-bold">請至少勾選一位人員</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={stepBack}
          disabled={step === 1}
          className="px-4 py-2.5 text-base font-bold border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          上一步
        </button>
        {step < 4 && (
          <button
            type="button"
            onClick={stepNext}
            disabled={
              (step === 1 && selectedPlanIds.size === 0) ||
              (step === 3 && !canProceedFromStep3)
            }
            className="px-5 py-2.5 text-base font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            下一步
          </button>
        )}
      </div>
    </div>
  );
}
