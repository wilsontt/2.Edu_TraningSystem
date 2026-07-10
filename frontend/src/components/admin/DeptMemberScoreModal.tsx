import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../../api';
import Pagination from '../common/Pagination';
import { format } from 'date-fns';
import clsx from 'clsx';
import { parseBackendDateTime } from '../../utils/date';
import { buildBatchPrintHtml, printHtmlInIframe, type MemberPrintItem } from '../personal/scoreCardPrintHtml';

interface DeptMember {
  emp_id: string;
  name: string;
  last_submit_time: string | null;
  last_score: number | null;
  is_passed: boolean | null;
  attendance_status: string;
  absence_reason: string | null;
  check_in_time: string | null;
  absence_recorded_at: string | null;
}

function formatBackendDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return parseBackendDateTime(iso)?.toLocaleString('zh-TW', { hour12: false }) ?? null;
}

interface PlanOption {
  plan_id: number;
  plan_title: string;
  training_date: string | null;
}

export interface DeptMemberScoreModalProps {
  open: boolean;
  onClose: () => void;
  deptId: number;
  deptName: string;
}

const PLAN_STATUS_LABELS: Record<string, string> = {
  active: '進行中',
  expired: '已過期',
  archived: '已封存',
};

const MEMBERS_PAGE_SIZE = 10;
const PRINT_WARN_THRESHOLD = 20;

export default function DeptMemberScoreModal({
  open,
  onClose,
  deptId,
  deptName,
}: DeptMemberScoreModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [planStatus, setPlanStatus] = useState<'active' | 'expired' | 'archived'>('active');
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planOptionsLoading, setPlanOptionsLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedPlanTitle, setSelectedPlanTitle] = useState('');
  const [members, setMembers] = useState<DeptMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [printMode, setPrintMode] = useState<'list' | 'individual'>('list');
  const [includeSignature, setIncludeSignature] = useState<'unset' | 'yes' | 'no'>('unset');
  const [printLoading, setPrintLoading] = useState(false);
  const [membersPage, setMembersPage] = useState(1);

  const loadPlanOptions = useCallback(
    async (status: string) => {
      setPlanOptionsLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(
          `${API_BASE_URL}/admin/reports/department/${deptId}/print-plan-options?plan_status=${status}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.status === 403) {
          setPlanOptions([]);
          setMembersError('您沒有查看此部門的權限');
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPlanOptions(data as PlanOption[]);
        setMembersError('');
      } catch {
        setPlanOptions([]);
        setMembersError('無法載入訓練計畫');
      } finally {
        setPlanOptionsLoading(false);
      }
    },
    [deptId]
  );

  // Modal 每次開啟時重置狀態
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPlanStatus('active');
    setSelectedPlanId(null);
    setSelectedPlanTitle('');
    setMembers([]);
    setMembersError('');
    setPrintMode('list');
    setIncludeSignature('unset');
    setMembersPage(1);
    loadPlanOptions('active');
  }, [open, deptId, loadPlanOptions]);

  const handlePlanStatusChange = (status: 'active' | 'expired' | 'archived') => {
    setPlanStatus(status);
    setSelectedPlanId(null);
    setSelectedPlanTitle('');
    setMembers([]);
    loadPlanOptions(status);
  };

  const handleSelectPlan = async (plan: PlanOption) => {
    setSelectedPlanId(plan.plan_id);
    setSelectedPlanTitle(plan.plan_title);
    setMembersLoading(true);
    setMembers([]);
    setMembersError('');
    setMembersPage(1);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/admin/reports/department/${deptId}/print-members?plan_id=${plan.plan_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data as DeptMember[]);
      if ((data as DeptMember[]).length === 0) {
        setMembersError('此部門目前無成員資料');
      }
    } catch {
      setMembersError('載入成員名單失敗');
    } finally {
      setMembersLoading(false);
    }
  };

  const handlePrintPdf = async () => {
    if (!selectedPlanId || includeSignature === 'unset') return;
    if (
      members.length > PRINT_WARN_THRESHOLD &&
      !window.confirm(
        `本次共 ${members.length} 人，超過 ${PRINT_WARN_THRESHOLD} 人可能產生較大列印，確定繼續？`
      )
    ) {
      return;
    }
    setPrintLoading(true);
    try {
      const token = localStorage.getItem('token');

      if (printMode === 'individual') {
        // 考卷成績單：與個人「成績詳情→預覽成績單→列印」同源，使用 HTML 瀏覽器列印
        const response = await fetch(`${API_BASE_URL}/admin/reports/dept-plan/individual-print-data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dept_id: deptId,
            plan_id: selectedPlanId,
            dept_name: deptName,
            plan_title: selectedPlanTitle,
          }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error((errData as { detail?: string }).detail || '載入成員資料失敗');
        }
        const printMembers = (await response.json()) as MemberPrintItem[];
        const htmlContent = buildBatchPrintHtml(printMembers, includeSignature === 'yes');
        printHtmlInIframe(htmlContent);
      } else {
        // 成績清單：下載後端產生的 PDF
        const response = await fetch(`${API_BASE_URL}/admin/reports/dept-plan/pdf`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dept_id: deptId,
            dept_name: deptName,
            plan_id: selectedPlanId,
            plan_title: selectedPlanTitle,
            print_mode: printMode,
            include_signature: includeSignature === 'yes',
          }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error((errData as { detail?: string }).detail || '產生失敗');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = format(new Date(), 'yyyyMMdd_HHmmss');
        a.download = `${selectedPlanTitle}_${deptName}_成績清單_${now}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (e) {
      alert(`列印失敗：${e instanceof Error ? e.message : '請稍後再試'}`);
    } finally {
      setPrintLoading(false);
    }
  };

  const paginatedMembers = members.slice(
    (membersPage - 1) * MEMBERS_PAGE_SIZE,
    membersPage * MEMBERS_PAGE_SIZE
  );
  const totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PAGE_SIZE));

  const stepBack = () => {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
    else onClose();
  };
  const stepNext = () => {
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-2xl flex-shrink-0">
          <div>
            <h3 className="text-lg font-black text-gray-900">
              {deptName}｜部門成員成績批次列印
            </h3>
            {members.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">共 {members.length} 位成員</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 步驟條 */}
        <div className="flex items-center justify-center gap-1 px-6 py-3 border-b border-gray-100 flex-shrink-0">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-black',
                  step > s
                    ? 'bg-green-600 text-white'
                    : step === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                )}
              >
                {step > s ? '✓' : s}
              </div>
              <span
                className={clsx(
                  'ml-1 text-xs font-bold',
                  step === s ? 'text-blue-600' : 'text-gray-400'
                )}
              >
                {s === 1 ? '訓練計畫' : s === 2 ? '列印方式' : '員工簽名'}
              </span>
              {s < 3 && <ChevronRight className="h-4 w-4 text-gray-300 mx-2" />}
            </div>
          ))}
        </div>

        {/* 主內容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* ── 詢問1：選計畫 ── */}
          {step === 1 && (
            <>
              {membersError && !selectedPlanId && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {membersError}
                </div>
              )}

              {/* 訓練階段 */}
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
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                    )}
                  >
                    {PLAN_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>

              {/* 計畫列表 */}
              <div className="border border-indigo-100 rounded-xl p-4">
                <h4 className="text-sm font-black text-gray-800 mb-3">選擇訓練計畫</h4>
                {planOptionsLoading ? (
                  <p className="text-sm text-gray-400 py-4 text-center">載入中...</p>
                ) : planOptions.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">
                    此階段無相關訓練計畫
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {planOptions.map((p) => (
                      <button
                        key={p.plan_id}
                        type="button"
                        onClick={() => handleSelectPlan(p)}
                        className={clsx(
                          'w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all cursor-pointer',
                          selectedPlanId === p.plan_id
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-black shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 font-bold hover:border-indigo-300 hover:bg-indigo-50/50'
                        )}
                      >
                        <span className="block truncate">{p.plan_title}</span>
                        {p.training_date && (
                          <span className="text-xs text-gray-400 font-normal">
                            {p.training_date}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 成員名單（選計畫後顯示） */}
              {selectedPlanId !== null && (
                <div className="border border-indigo-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-black text-gray-800">
                      部門成員名單
                      {members.length > 0 && (
                        <span className="ml-1 text-gray-500 font-normal">
                          （{members.length} 人）
                        </span>
                      )}
                    </h4>
                    {members.length > PRINT_WARN_THRESHOLD && (
                      <span className="flex items-center gap-1 text-xs text-orange-500 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        超過 {PRINT_WARN_THRESHOLD} 人，列印可能較慢
                      </span>
                    )}
                  </div>

                  {membersLoading ? (
                    <p className="text-sm text-gray-400 py-4 text-center">載入中...</p>
                  ) : membersError ? (
                    <p className="text-sm text-red-500 py-4 text-center">{membersError}</p>
                  ) : members.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">此部門無成員資料</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="w-full text-sm">
                          <thead className="bg-indigo-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-black text-gray-600">
                                員工編號
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-black text-gray-600">
                                姓名
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-black text-gray-600">
                                分數
                              </th>
                              <th className="px-3 py-2 text-center text-xs font-black text-gray-600">
                                結果
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-black text-gray-600">
                                考試時間
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-black text-gray-600">
                                出席狀態
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedMembers.map((m, idx) => (
                              <tr
                                key={m.emp_id}
                                className={clsx(
                                  'border-t border-gray-100',
                                  idx % 2 === 1 ? 'bg-gray-50' : 'bg-white'
                                )}
                              >
                                <td className="px-3 py-2 text-gray-500 tabular-nums text-xs">
                                  {m.emp_id}
                                </td>
                                <td className="px-3 py-2 font-bold text-gray-900">
                                  {m.name}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {m.last_score !== null ? (
                                    <span
                                      className={clsx(
                                        'font-black',
                                        m.is_passed ? 'text-green-600' : 'text-red-500'
                                      )}
                                    >
                                      {m.last_score}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {m.is_passed !== null ? (
                                    <span
                                      className={clsx(
                                        'inline-flex px-2 py-0.5 rounded-full text-xs font-bold',
                                        m.is_passed
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-red-100 text-red-600'
                                      )}
                                    >
                                      {m.is_passed ? '通過' : '未通過'}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">
                                  {m.last_submit_time
                                    ? formatBackendDateTime(m.last_submit_time)
                                    : '—'}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  <div>{m.attendance_status}</div>
                                  {(m.check_in_time || m.absence_recorded_at) && (
                                    <div className="text-gray-400 tabular-nums mt-0.5">
                                      {formatBackendDateTime(m.check_in_time ?? m.absence_recorded_at)}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {members.length > MEMBERS_PAGE_SIZE && (
                        <div className="mt-2">
                          <Pagination
                            currentPage={membersPage}
                            totalPages={totalPages}
                            pageSize={MEMBERS_PAGE_SIZE}
                            totalItems={members.length}
                            onPageChange={setMembersPage}
                            onPageSizeChange={() => {}}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 詢問2：列印方式 ── */}
          {step === 2 && (
            <div className="border border-indigo-100 rounded-xl p-4">
              <h4 className="text-sm font-black text-gray-800 mb-1">詢問2：列印方式</h4>
              <p className="text-xs text-gray-500 mb-4">
                以每人「最後一次考試」（submit_time 最大值）為準。未考試者仍列入，並標示出席狀態原因。
              </p>
              <div className="space-y-3">
                <label
                  className={clsx(
                    'flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition',
                    printMode === 'individual'
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                  )}
                >
                  <input
                    type="radio"
                    name="dept_print_mode"
                    checked={printMode === 'individual'}
                    onChange={() => setPrintMode('individual')}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-black text-gray-800">考卷成績單</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      每位成員一頁，版式同個人「成績詳情」列印
                    </div>
                  </div>
                </label>
                <label
                  className={clsx(
                    'flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition',
                    printMode === 'list'
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                  )}
                >
                  <input
                    type="radio"
                    name="dept_print_mode"
                    checked={printMode === 'list'}
                    onChange={() => setPrintMode('list')}
                    className="mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-black text-gray-800">考試成績清單</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      所有成員一份清單（欄位含分數、結果、出席狀態）
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ── 詢問3：員工簽名 ── */}
          {step === 3 && (
            <div className="border border-indigo-100 rounded-xl p-4">
              <h4 className="text-sm font-black text-gray-800 mb-3">詢問3：列印員工簽名</h4>
              <div className="space-y-3" role="radiogroup" aria-label="列印員工簽名">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="dept_signature"
                    checked={includeSignature === 'no'}
                    onChange={() => setIncludeSignature('no')}
                    className="cursor-pointer"
                  />
                  否
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="dept_signature"
                    checked={includeSignature === 'yes'}
                    onChange={() => setIncludeSignature('yes')}
                    className="cursor-pointer"
                  />
                  是（列印「考生簽名 / 日期」雙欄）
                </label>
              </div>
              {includeSignature === 'unset' && (
                <p className="text-xs text-gray-400 mt-2">請選擇是否列印簽名</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={stepBack}
            className="px-4 py-2 text-sm font-bold border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            {step === 1 ? '取消' : '上一步'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={stepNext}
              disabled={step === 1 && (!selectedPlanId || membersLoading)}
              className="px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={includeSignature === 'unset' || printLoading}
              className="px-5 py-2 text-sm font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
            >
              {printLoading ? '產生中...' : '產生 PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
