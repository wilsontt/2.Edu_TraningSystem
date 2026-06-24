/**
 * 成績中心｜批次列印（管理端跨人員功能）
 * 四步精靈：1 篩選（計畫狀態／訓練計畫／部門）→ 2 列印類型 → 3 人員預覽勾選 → 4 產出。
 */
import { useEffect, useMemo, useState } from 'react';
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
    exportPdf,
    exportIndividualHtml,
  } = useBatchPrint();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewSearch, setPreviewSearch] = useState('');
  const [hasLoadedPreviewOnce, setHasLoadedPreviewOnce] = useState(false);

  useEffect(() => {
    fetchDeptOptions().catch(() => setError('載入部門清單失敗'));
    fetchPlanOptions().catch(() => setError('載入訓練計畫清單失敗'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  };

  // 選了「考試歷程」時，「考卷成績單(individual)」應禁用（後端 individual-data 僅支援 last_attempt）
  const individualDisabled = scoreDataMode === 'exam_history';

  useEffect(() => {
    if (individualDisabled && printMode === 'individual') {
      setPrintMode('list');
    }
  }, [individualDisabled, printMode, setPrintMode]);

  const filteredPreviewItems = useMemo(() => {
    const term = previewSearch.trim().toLowerCase();
    if (!term) return previewItems;
    return previewItems.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.emp_id.toLowerCase().includes(term) ||
        item.dept_name.toLowerCase().includes(term),
    );
  }, [previewItems, previewSearch]);

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
      printMode === 'individual' &&
      selectedEmpIds.size > BATCH_PRINT_INDIVIDUAL_WARN_THRESHOLD &&
      !window.confirm(
        `本次共 ${selectedEmpIds.size} 人，超過 ${BATCH_PRINT_INDIVIDUAL_WARN_THRESHOLD} 人可能產生較大列印，確定繼續？`,
      )
    ) {
      return;
    }
    if (printMode === 'individual') {
      await exportIndividualHtml();
    } else {
      await exportPdf();
    }
  };

  const stepLabels: Record<1 | 2 | 3 | 4, string> = {
    1: '篩選',
    2: '列印類型',
    3: '人員',
    4: '產出',
  };

  const stepNext = () => setStep((s) => (Math.min(4, s + 1) as 1 | 2 | 3 | 4));
  const stepBack = () => setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3 | 4));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
          <Printer className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">批次列印</h2>
          <p className="text-sm text-gray-500">跨部門／跨計畫批次產生成績清單或考卷成績單</p>
        </div>
      </header>

      {/* 步驟條 */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {([1, 2, 3, 4] as const).map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-black',
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
                'ml-1 text-xs font-bold',
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
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── 步驟 1：篩選 ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(['active', 'expired', 'archived'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handlePlanStatusChange(s)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer',
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
            <h4 className="text-sm font-black text-gray-800 mb-3">
              選擇訓練計畫（已選 {selectedPlanIds.size} 項，至少一項）
            </h4>
            {planOptions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">尚無可列印訓練計畫</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {planOptions.map((p) => (
                  <label
                    key={p.plan_id}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm border cursor-pointer transition-all',
                      selectedPlanIds.has(p.plan_id)
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-black'
                        : 'bg-white border-gray-200 text-gray-700 font-bold hover:border-indigo-300 hover:bg-indigo-50/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlanIds.has(p.plan_id)}
                      onChange={() => togglePlanId(p.plan_id)}
                    />
                    <span className="truncate flex-1">{p.plan_title}</span>
                    {p.training_date && (
                      <span className="text-xs text-gray-400 font-normal">{p.training_date}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="border border-indigo-100 rounded-xl p-4">
            <h4 className="text-sm font-black text-gray-800 mb-3">
              選擇部門（不選表示權限範圍內全部部門，已選 {selectedDeptIds.size} 項）
            </h4>
            {deptOptions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">尚無可選部門</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {deptOptions.map((d) => (
                  <label
                    key={d.dept_id}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm border cursor-pointer transition-all',
                      selectedDeptIds.has(d.dept_id)
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-black'
                        : 'bg-white border-gray-200 text-gray-700 font-bold hover:border-indigo-300 hover:bg-indigo-50/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDeptIds.has(d.dept_id)}
                      onChange={() => toggleDeptId(d.dept_id)}
                    />
                    <span className="truncate">{d.dept_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 步驟 2：列印類型 ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="border border-indigo-100 rounded-xl p-4">
            <h4 className="text-sm font-black text-gray-800 mb-3">成績資料範圍</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="score_data_mode"
                  checked={scoreDataMode === 'last_attempt'}
                  onChange={() => setScoreDataMode('last_attempt')}
                />
                最後一次考試成績
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
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

          <div className="border border-indigo-100 rounded-xl p-4">
            <h4 className="text-sm font-black text-gray-800 mb-3">列印方式</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
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
                  'flex items-center gap-2 text-sm font-bold cursor-pointer',
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
                考卷成績單(individual)
              </label>
              {individualDisabled && (
                <p className="text-xs text-orange-500 font-bold pl-6">
                  「考試歷程」目前僅支援成績清單，考卷成績單僅支援「最後一次考試成績」
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 步驟 3：人員 ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleLoadPreview}
              disabled={loading || selectedPlanIds.size === 0}
              className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? '載入中...' : '載入預覽'}
            </button>
            {hasLoadedPreviewOnce && (
              <span className="text-sm text-gray-500 font-medium">
                共 {previewTotal} 筆，已勾選 {selectedEmpIds.size} 人
              </span>
            )}
          </div>

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
                  className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="text-xs font-bold px-2 py-1.5 border border-indigo-200 text-indigo-600 rounded hover:bg-indigo-50 whitespace-nowrap"
                >
                  {allFilteredSelected ? '取消全選' : '全選目前清單'}
                </button>
              </div>

              {filteredPreviewItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">
                  {previewItems.length === 0 ? '尚無預覽資料，請先載入預覽' : '無符合搜尋條件的資料'}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-black text-gray-600 w-10" />
                          <th className="px-3 py-2 text-left text-xs font-black text-gray-600">員工編號</th>
                          <th className="px-3 py-2 text-left text-xs font-black text-gray-600">姓名</th>
                          <th className="px-3 py-2 text-left text-xs font-black text-gray-600">部門</th>
                          <th className="px-3 py-2 text-left text-xs font-black text-gray-600">訓練計畫</th>
                          <th className="px-3 py-2 text-right text-xs font-black text-gray-600">分數</th>
                          <th className="px-3 py-2 text-center text-xs font-black text-gray-600">結果</th>
                          <th className="px-3 py-2 text-left text-xs font-black text-gray-600">考試時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedPreviewItems.map((item, idx) => (
                          <tr
                            key={`${item.emp_id}-${item.plan_id}`}
                            className={clsx(
                              'border-t border-gray-100',
                              idx % 2 === 1 ? 'bg-gray-50' : 'bg-white',
                            )}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedEmpIds.has(item.emp_id)}
                                onChange={() => toggleEmpId(item.emp_id)}
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-500 tabular-nums text-xs">{item.emp_id}</td>
                            <td className="px-3 py-2 font-bold text-gray-900">{item.name}</td>
                            <td className="px-3 py-2 text-gray-600">{item.dept_name}</td>
                            <td className="px-3 py-2 text-gray-600 truncate max-w-48">{item.plan_title}</td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={clsx(
                                  'font-black',
                                  item.is_passed ? 'text-green-600' : 'text-red-500',
                                )}
                              >
                                {item.total_score}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={clsx(
                                  'inline-flex px-2 py-0.5 rounded-full text-xs font-bold',
                                  item.is_passed
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-600',
                                )}
                              >
                                {item.is_passed ? '通過' : '未通過'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">
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

      {/* ── 步驟 4：產出 ── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="border border-indigo-100 rounded-xl p-4">
            <h4 className="text-sm font-black text-gray-800 mb-3">員工簽名</h4>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeEmployeeSignature}
                onChange={(e) => setIncludeEmployeeSignature(e.target.checked)}
              />
              列印「考生簽名 / 日期」雙欄
            </label>
          </div>

          <div className="border border-indigo-100 rounded-xl p-4 space-y-2 text-sm text-gray-600">
            <p>已選訓練計畫：{selectedPlanIds.size} 項</p>
            <p>已選部門：{selectedDeptIds.size === 0 ? '權限範圍內全部' : `${selectedDeptIds.size} 項`}</p>
            <p>已勾選人員：{selectedEmpIds.size} 人</p>
            <p>
              成績資料範圍：{scoreDataMode === 'last_attempt' ? '最後一次考試成績' : '考試歷程'}／
              列印方式：{printMode === 'list' ? '成績清單' : '考卷成績單'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={loading || selectedPlanIds.size === 0}
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? '產生中...' : printMode === 'individual' ? '列印考卷成績單' : '產生 PDF'}
          </button>
        </div>
      )}

      {/* Footer 步驟導航 */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={stepBack}
          disabled={step === 1}
          className="px-4 py-2 text-sm font-bold border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          上一步
        </button>
        {step < 4 && (
          <button
            type="button"
            onClick={stepNext}
            disabled={step === 1 && selectedPlanIds.size === 0}
            className="px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            下一步
          </button>
        )}
      </div>
    </div>
  );
}
