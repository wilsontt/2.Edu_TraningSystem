import { useState, useEffect } from 'react';
import { BarChart3, Loader2, X } from 'lucide-react';
import api from '../../api';
import BulkAbsenceReasonModal from './BulkAbsenceReasonModal';

interface PlanSummary {
  id: number;
  title: string;
  training_date: string;
  end_date: string | null;
  year?: string;
  /** 後端 TrainingPlan 欄位；報到總覽用於禁用封存計畫之未到原因編輯 */
  is_archived?: boolean;
}

interface AttendanceStats {
  plan_id: number;
  expected_count: number;
  actual_count: number;
  attendance_rate: number;
  leave_count?: number;
  absent_without_reason_count?: number;
  checked_in_users: Array<{ emp_id: string; name: string; dept_name: string; checkin_time: string }>;
  not_checked_in_users: Array<{
    emp_id: string;
    name: string;
    dept_name: string;
    absence_reason_code?: string;
    absence_reason_text?: string;
  }>;
}

interface AbsenceReasonUpdateResponse {
  success: boolean;
  updated_count?: number;
  stats?: AttendanceStats;
}

const ABSENCE_REASON_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'sick_leave', label: '病假' },
  { code: 'business_trip', label: '出差' },
  { code: 'official_leave', label: '公假' },
  { code: 'other', label: '其他' },
  { code: 'cancel_leave', label: '取消請假' },
];

type TabStatus = 'active' | 'expired' | 'archived';

const getCardClass = (isActive: boolean, palette: 'indigo' | 'green' | 'orange' | 'purple') => {
  if (palette === 'indigo') {
    return isActive
      ? 'bg-indigo-100 border-2 border-indigo-500 ring-2 ring-indigo-300 shadow-md shadow-indigo-200'
      : 'bg-indigo-50 border border-indigo-200';
  }
  if (palette === 'green') {
    return isActive
      ? 'bg-green-100 border-2 border-green-500 ring-2 ring-green-300 shadow-md shadow-green-200'
      : 'bg-green-50 border border-green-200';
  }
  if (palette === 'orange') {
    return isActive
      ? 'bg-orange-100 border-2 border-orange-500 ring-2 ring-orange-300 shadow-md shadow-orange-200'
      : 'bg-orange-50 border border-orange-200';
  }
  return isActive
    ? 'bg-purple-100 border-2 border-purple-500 ring-2 ring-purple-300 shadow-md shadow-purple-200'
    : 'bg-purple-50 border border-purple-200';
};

/**
 * 報到總覽：與訓練計畫管理相同分頁（正在進行中／已過期／已封存），表格含操作欄可查看報到統計。
 */
const AttendanceOverviewPage = () => {
  const [activeTab] = useState<TabStatus>('active');
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [statsMap, setStatsMap] = useState<Record<number, AttendanceStats>>({});
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [modalPlanId, setModalPlanId] = useState<number | null>(null);
  const [modalStats, setModalStats] = useState<AttendanceStats | null>(null);
  const [absenceReasonEdit, setAbsenceReasonEdit] = useState<{
    empId: string;
    name: string;
    reasonCode: string;
    reasonText: string;
  } | null>(null);
  const [bulkAbsenceReasonEdit, setBulkAbsenceReasonEdit] = useState<{
    reasonCode: string;
    reasonText: string;
  } | null>(null);
  const [savingAbsenceReason, setSavingAbsenceReason] = useState(false);
  const [selectedAttendanceFilter, setSelectedAttendanceFilter] = useState<'expected' | 'actual' | 'absent' | 'leave'>('expected');

  const handlePrintCurrentList = async () => {
    if (!modalStats) return;
    const expectedList = [
      ...modalStats.checked_in_users.map((u) => ({ emp_id: u.emp_id, isLeave: false })),
      ...modalStats.not_checked_in_users.map((u) => ({ emp_id: u.emp_id, isLeave: !!u.absence_reason_code })),
    ];
    const targetList =
      selectedAttendanceFilter === 'expected'
        ? expectedList
        : selectedAttendanceFilter === 'actual'
          ? modalStats.checked_in_users.map((u) => ({ emp_id: u.emp_id, isLeave: false }))
          : selectedAttendanceFilter === 'absent'
            ? modalStats.not_checked_in_users.filter((u) => !u.absence_reason_code).map((u) => ({ emp_id: u.emp_id, isLeave: false }))
            : modalStats.not_checked_in_users.filter((u) => !!u.absence_reason_code).map((u) => ({ emp_id: u.emp_id, isLeave: true }));
    if (targetList.length === 0) {
      alert('目前清單無資料可列印');
      return;
    }
    try {
      const res = await api.post(`/training/plans/${modalStats.plan_id}/attendance/print/pdf`, {
        attendance_filter: selectedAttendanceFilter,
        include_signature: false,
      }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-print-${modalStats.plan_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('列印失敗');
    }
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const res = await api.get('/training/plans', {
          params: { status: 'active' },
        });
        setPlans(res.data || []);
        setStatsMap({});
        setModalPlanId(null);
      } catch (err) {
        console.error('載入計畫失敗', err);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, [activeTab]);

  useEffect(() => {
    if (plans.length === 0) {
      setStatsMap({});
      return;
    }
    const fetchAllStats = async () => {
      setLoadingStats(true);
      const next: Record<number, AttendanceStats> = {};
      for (const plan of plans) {
        try {
          const res = await api.get<AttendanceStats>(`/training/plans/${plan.id}/attendance/stats`);
          next[plan.id] = res.data;
        } catch {
          next[plan.id] = {
            plan_id: plan.id,
            expected_count: 0,
            actual_count: 0,
            attendance_rate: 0,
            checked_in_users: [],
            not_checked_in_users: [],
          };
        }
      }
      setStatsMap(next);
      setLoadingStats(false);
    };
    fetchAllStats();
  }, [plans]);

  const openAttendanceModal = async (planId: number) => {
    setModalPlanId(planId);
    const stats = statsMap[planId];
    if (stats) {
      setModalStats(stats);
      return;
    }
    setModalStats(null);
    try {
      const res = await api.get<AttendanceStats>(`/training/plans/${planId}/attendance/stats`);
      setModalStats(res.data);
    } catch {
      setModalStats(null);
    }
  };

  const closeModal = () => {
    setModalPlanId(null);
    setModalStats(null);
    setSelectedAttendanceFilter('expected');
  };

  const modalPlan = modalPlanId ? plans.find((p) => p.id === modalPlanId) : null;
  /** 封存計畫僅能檢視統計，不可填寫／編輯未到原因 */
  const absenceReasonReadOnly =
    Boolean(modalPlan?.is_archived) || activeTab === 'archived';

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
          <BarChart3 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-1">報到總覽</h1>
          <p className="text-gray-500 font-medium">同時檢視多個訓練計畫的報到統計</p>
        </div>
      </header>

      <div className="inline-flex gap-2 p-2 bg-green-50 border border-green-100 rounded-xl text-sm font-bold text-green-700">
        目前僅顯示：正在進行中
      </div>

      {loading ? (
        <div className="py-20 flex justify-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-8 text-center text-gray-600">
          目前尚無正在進行中的訓練計畫。
        </div>
      ) : (
        <>
          {loadingStats && (
            <div className="flex items-center gap-2 text-sm text-indigo-600 font-bold">
              <Loader2 className="w-4 h-4 animate-spin" />
              載入各計畫報到統計中…
            </div>
          )}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">訓練計畫</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">日期</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700">應到</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700">實到</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700">未到</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-700">出席率</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map((plan) => {
                  const stats = statsMap[plan.id];
                  const absent = stats
                    ? Math.max(0, stats.expected_count - stats.actual_count)
                    : 0;
                  return (
                    <tr key={plan.id} className="even:bg-gray-100 hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-900">{plan.title}</td>
                      <td className="px-4 py-3 text-gray-600">{plan.training_date}</td>
                      <td className="px-4 py-3 text-right font-mono">{stats ? stats.expected_count : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-600">{stats ? stats.actual_count : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-orange-600">{stats ? absent : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-600">
                        {stats ? `${stats.attendance_rate.toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => openAttendanceModal(plan.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          報到統計
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 報到統計 Modal */}
      {modalPlanId && modalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-indigo-100 flex justify-between items-center bg-linear-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                報到統計 - {modalPlan.title}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintCurrentList}
                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  列印目前清單
                </button>
                <button type="button" onClick={closeModal} className="p-2 hover:bg-white/50 rounded-xl cursor-pointer">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {!modalStats ? (
                <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
              ) : (
                <>
                  {absenceReasonReadOnly && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                      此訓練計畫已封存，僅能檢視報到紀錄與未到名單，無法編輯未到原因。
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <button
                      type="button"
                      onClick={() => setSelectedAttendanceFilter('expected')}
                      className={`p-4 rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'expected', 'indigo')}`}
                    >
                      <div className="text-sm font-bold text-indigo-600 mb-1">應到人數</div>
                      <div className="text-2xl font-black text-indigo-800">{modalStats.expected_count}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAttendanceFilter('actual')}
                      className={`p-4 rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'actual', 'green')}`}
                    >
                      <div className="text-sm font-bold text-green-600 mb-1">實到人數</div>
                      <div className="text-2xl font-black text-green-800">{modalStats.actual_count}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAttendanceFilter('absent')}
                      className={`p-4 rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'absent', 'orange')}`}
                    >
                      <div className="text-sm font-bold text-orange-600 mb-1">未到人數</div>
                      <div className="text-2xl font-black text-orange-800">{modalStats.absent_without_reason_count ?? Math.max(0, modalStats.expected_count - modalStats.actual_count)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAttendanceFilter('leave')}
                      className={`p-4 rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'leave', 'purple')}`}
                    >
                      <div className="text-sm font-bold text-purple-600 mb-1">請假人數</div>
                      <div className="text-2xl font-black text-purple-800">{modalStats.leave_count ?? 0}</div>
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-gray-700">
                        {selectedAttendanceFilter === 'expected' && `應到清單 (${modalStats.expected_count})`}
                        {selectedAttendanceFilter === 'actual' && `實到清單 (${modalStats.checked_in_users.length})`}
                        {selectedAttendanceFilter === 'absent' && `未到清單 (${modalStats.absent_without_reason_count ?? modalStats.not_checked_in_users.filter(u => !u.absence_reason_code).length})`}
                        {selectedAttendanceFilter === 'leave' && `請假清單 (${modalStats.leave_count ?? modalStats.not_checked_in_users.filter(u => u.absence_reason_code).length})`}
                        </h4>
                        {!absenceReasonReadOnly && (selectedAttendanceFilter === 'absent' || selectedAttendanceFilter === 'leave') && (
                          <button
                            type="button"
                            onClick={() => setBulkAbsenceReasonEdit({ reasonCode: '', reasonText: '' })}
                            className="px-2.5 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 cursor-pointer"
                          >
                            一鍵填寫多人請假原因
                          </button>
                        )}
                      </div>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">ITEM</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">員工編號</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">姓名</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">部門</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">
                                {selectedAttendanceFilter === 'actual' ? '報到時間' : '未到原因'}
                              </th>
                              {!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' && (
                                <th className="px-4 py-2 text-left text-xs font-bold text-gray-600">操作</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(() => {
                              const expectedList = [
                                ...modalStats.checked_in_users.map((u) => ({ ...u, kind: 'actual' as const })),
                                ...modalStats.not_checked_in_users.map((u) => ({ ...u, kind: 'absent' as const })),
                              ];
                              const currentList =
                                selectedAttendanceFilter === 'expected'
                                  ? expectedList
                                  : selectedAttendanceFilter === 'actual'
                                    ? modalStats.checked_in_users.map((u) => ({ ...u, kind: 'actual' as const }))
                                    : selectedAttendanceFilter === 'absent'
                                      ? modalStats.not_checked_in_users.filter((u) => !u.absence_reason_code).map((u) => ({ ...u, kind: 'absent' as const }))
                                      : modalStats.not_checked_in_users.filter((u) => !!u.absence_reason_code).map((u) => ({ ...u, kind: 'absent' as const }));

                              if (currentList.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' ? 6 : 5} className="px-4 py-4 text-center text-gray-400 text-xs">
                                      查無資料
                                    </td>
                                  </tr>
                                );
                              }
                              return currentList.map((user, idx) => (
                                <tr key={`${user.emp_id}-${idx}`} className="even:bg-gray-100">
                                  <td className="px-4 py-2 font-mono text-xs">{idx + 1}</td>
                                  <td className="px-4 py-2 font-mono text-xs">{user.emp_id}</td>
                                  <td className="px-4 py-2 font-bold">{user.name}</td>
                                  <td className="px-4 py-2 text-gray-600">{user.dept_name}</td>
                                  <td className="px-4 py-2 text-gray-500 text-xs">
                                    {user.kind === 'actual' && 'checkin_time' in user && user.checkin_time
                                      ? new Date(user.checkin_time).toLocaleString('zh-TW')
                                      : ('absence_reason_code' in user && user.absence_reason_code
                                          ? `${ABSENCE_REASON_OPTIONS.find(o => o.code === user.absence_reason_code)?.label || user.absence_reason_code}${user.absence_reason_code === 'other' && user.absence_reason_text ? `：${user.absence_reason_text}` : ''}`
                                          : '-')}
                                  </td>
                                  {!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' && user.kind !== 'actual' && (
                                    <td className="px-4 py-2">
                                      <button
                                        type="button"
                                        onClick={() => setAbsenceReasonEdit({
                                          empId: user.emp_id,
                                          name: user.name,
                                          reasonCode: 'absence_reason_code' in user ? (user.absence_reason_code || '') : '',
                                          reasonText: 'absence_reason_text' in user ? (user.absence_reason_text || '') : '',
                                        })}
                                        className="px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                                      >
                                        {'absence_reason_code' in user && user.absence_reason_code ? '編輯原因' : '填寫原因'}
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button type="button" onClick={() => { closeModal(); setAbsenceReasonEdit(null); }} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 cursor-pointer">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 未報到原因編輯 Modal */}
      {absenceReasonEdit && modalPlanId && !absenceReasonReadOnly && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-indigo-100 bg-indigo-50/50">
              <h3 className="text-lg font-black text-gray-900">填寫未報到原因 - {absenceReasonEdit.name}</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">原因</label>
                <select
                  value={absenceReasonEdit.reasonCode}
                  onChange={(e) => setAbsenceReasonEdit(prev => prev ? { ...prev, reasonCode: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">請選擇</option>
                  {ABSENCE_REASON_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {absenceReasonEdit.reasonCode === 'other' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">原因說明（必填）</label>
                  <input
                    type="text"
                    value={absenceReasonEdit.reasonText}
                    onChange={(e) => setAbsenceReasonEdit(prev => prev ? { ...prev, reasonText: e.target.value } : null)}
                    placeholder="請填寫未到原因"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button type="button" onClick={() => setAbsenceReasonEdit(null)} className="px-4 py-2 text-gray-600 font-bold rounded-lg hover:bg-gray-100 cursor-pointer">
                取消
              </button>
              <button
                type="button"
                disabled={savingAbsenceReason || !absenceReasonEdit.reasonCode || (absenceReasonEdit.reasonCode === 'other' && !absenceReasonEdit.reasonText.trim())}
                onClick={async () => {
                  if (!absenceReasonEdit || !modalPlanId) return;
                  setSavingAbsenceReason(true);
                  try {
                    const updateRes = await api.put<AbsenceReasonUpdateResponse>(`/training/plans/${modalPlanId}/attendance/absence-reason`, {
                      emp_id: absenceReasonEdit.empId,
                      reason_code: absenceReasonEdit.reasonCode,
                      reason_text: absenceReasonEdit.reasonCode === 'other' ? absenceReasonEdit.reasonText : undefined,
                    });
                    const latestStats = updateRes.data.stats;
                    if (latestStats) {
                      setModalStats(latestStats);
                      setStatsMap(prev => ({ ...prev, [modalPlanId]: latestStats }));
                    } else {
                      const res = await api.get<AttendanceStats>(`/training/plans/${modalPlanId}/attendance/stats`);
                      setModalStats(res.data);
                      setStatsMap(prev => ({ ...prev, [modalPlanId]: res.data }));
                    }
                    setAbsenceReasonEdit(null);
                  } catch (err: unknown) {
                    alert(err && typeof err === 'object' && 'response' in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : '儲存失敗');
                  } finally {
                    setSavingAbsenceReason(false);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
              >
                {savingAbsenceReason ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批次未報到原因編輯 Modal */}
      {bulkAbsenceReasonEdit && modalPlanId && modalStats && !absenceReasonReadOnly && (
        <BulkAbsenceReasonModal
          users={
            selectedAttendanceFilter === 'leave'
              ? modalStats.not_checked_in_users.filter((u) => !!u.absence_reason_code)
              : modalStats.not_checked_in_users.filter((u) => !u.absence_reason_code)
          }
          busy={savingAbsenceReason}
          onClose={() => setBulkAbsenceReasonEdit(null)}
          onSubmit={async (payload) => {
            setSavingAbsenceReason(true);
            try {
              const updateRes = await api.put<AbsenceReasonUpdateResponse>(`/training/plans/${modalPlanId}/attendance/absence-reason/bulk`, payload);
              const latestStats = updateRes.data.stats;
              if (latestStats) {
                setModalStats(latestStats);
                setStatsMap(prev => ({ ...prev, [modalPlanId]: latestStats }));
              } else {
                const res = await api.get<AttendanceStats>(`/training/plans/${modalPlanId}/attendance/stats`);
                setModalStats(res.data);
                setStatsMap(prev => ({ ...prev, [modalPlanId]: res.data }));
              }
              setBulkAbsenceReasonEdit(null);
            } catch (err: unknown) {
              alert(err && typeof err === 'object' && 'response' in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : '批次儲存失敗');
            } finally {
              setSavingAbsenceReason(false);
            }
          }}
        />
      )}
    </div>
  );
};

export default AttendanceOverviewPage;
