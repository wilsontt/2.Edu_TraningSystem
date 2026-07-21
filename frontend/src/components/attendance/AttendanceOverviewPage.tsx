import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { format } from 'date-fns';
import { AxiosError } from 'axios';
import { BarChart3, Loader2, Search, X, QrCode, Copy, Check, RefreshCw, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import api from '../../api';
import BulkAbsenceReasonModal from './BulkAbsenceReasonModal';
import Pagination from '../common/Pagination';
import { parseFilenameFromContentDisposition } from '../../hooks/useBatchPrint';
import { parseBackendDateTime } from '../../utils/date';
import { matchesPlanSearch, matchesBatchCandidateFilter } from '../../utils/planSearch';
import { formatAttendanceCheckinEventLabel } from '../../utils/attendanceCheckinEventLabel';
import type { User } from '../../types';

interface PlanSummary {
  id: number;
  title: string;
  training_date: string;
  end_date: string | null;
  year?: string;
  dept_id?: number | null;
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

interface AttendanceCheckinEvent {
  id: number;
  emp_id: string;
  plan_id: number;
  event_time: string | null;
  event_type: string;
  batch_id: string | null;
  batch_label: string | null;
  source: string;
  result: string;
  ip_address: string | null;
}

interface AttendanceBatchPlanBrief {
  plan_id: number;
  title: string;
  training_date: string;
}

interface AttendanceBatchOut {
  id: string;
  label: string;
  training_date: string;
  status: string;
  created_by: string;
  created_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  plans: AttendanceBatchPlanBrief[];
  qrcode_url: string | null;
  checkin_url: string | null;
}

interface AttendanceBatchPlanStats {
  plan_id: number;
  title: string;
  expected_count: number;
  actual_count: number;
  absent_count: number;
  attendance_rate: number;
}

interface AttendanceBatchStatsOut {
  batch_id: string;
  status: string;
  plans: AttendanceBatchPlanStats[];
}

const frontendBaseUrl = () =>
  `${window.location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/$/, '');

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

type PlanStatusFilter = 'active' | 'expired' | 'archived' | 'all';

const EMPTY_PLAN_MESSAGES: Record<PlanStatusFilter, string> = {
  active: '目前尚無正在進行中的訓練計畫。',
  expired: '目前尚無已過期的訓練計畫。',
  archived: '目前尚無已封存的訓練計畫。',
  all: '目前尚無訓練計畫。',
};

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
 * 報到總覽：狀態篩選（正在進行中／已過期／已封存／全部）＋搜尋，表格含操作欄可查看報到統計。
 */
const AttendanceOverviewPage = (_props: { user: User }) => {
  const [planStatusFilter, setPlanStatusFilter] = useState<PlanStatusFilter>('active');
  const [searchTerm, setSearchTerm] = useState('');
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
  const [listSearchTerm, setListSearchTerm] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);

  // 報到 QRcode 狀態：內嵌於「報到統計」Modal 內，可與報到狀況同時檢視
  const [qrPanelOpen, setQrPanelOpen] = useState(false);
  const [checkinQRCode, setCheckinQRCode] = useState<{
    plan_id: number;
    plan_title: string;
    qrcode_url: string;
    checkin_url: string;
  } | null>(null);
  const [generatingQRCode, setGeneratingQRCode] = useState(false);
  const [copiedCheckinUrl, setCopiedCheckinUrl] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);

  // 報到歷程（人員列展開）
  const [expandedHistoryEmpId, setExpandedHistoryEmpId] = useState<string | null>(null);
  const [historyEventsMap, setHistoryEventsMap] = useState<Record<string, AttendanceCheckinEvent[]>>({});
  const [loadingHistoryEmpId, setLoadingHistoryEmpId] = useState<string | null>(null);

  // 多場訓練合併報到
  const [batchSelectOpen, setBatchSelectOpen] = useState(false);
  /** 場次／報到日（寫入批次；同時可作候選日期篩選） */
  const [batchSessionDate, setBatchSessionDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  /** 是否用場次日做候選篩選；關閉後僅關鍵字（或列全部） */
  const [batchFilterByDate, setBatchFilterByDate] = useState(true);
  const [batchKeyword, setBatchKeyword] = useState('');
  const [batchActivePlans, setBatchActivePlans] = useState<PlanSummary[]>([]);
  const [batchSelectLoading, setBatchSelectLoading] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<number[]>([]);
  const [batchLabel, setBatchLabel] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  const [batchModal, setBatchModal] = useState<AttendanceBatchOut | null>(null);
  const [batchStats, setBatchStats] = useState<AttendanceBatchStatsOut | null>(null);
  const [batchStatsLoading, setBatchStatsLoading] = useState(false);
  const [batchStatusUpdating, setBatchStatusUpdating] = useState(false);
  const [copiedBatchUrl, setCopiedBatchUrl] = useState(false);

  /** 重新查詢目前開啟計畫的報到統計（供人員報到後手動刷新） */
  const refreshModalStats = async () => {
    if (!modalPlanId) return;
    setRefreshingStats(true);
    try {
      const res = await api.get<AttendanceStats>(`/training/plans/${modalPlanId}/attendance/stats`);
      setModalStats(res.data);
      setStatsMap((prev) => ({ ...prev, [modalPlanId]: res.data }));
    } catch {
      alert('更新失敗，請稍後再試');
    } finally {
      setRefreshingStats(false);
    }
  };

  /** 切換 QRcode 面板；首次展開且尚未產生過該計畫的 QR 時才呼叫 API */
  const handleToggleQrPanel = async (plan: PlanSummary) => {
    if (qrPanelOpen) {
      setQrPanelOpen(false);
      return;
    }
    setQrPanelOpen(true);
    if (checkinQRCode && checkinQRCode.plan_id === plan.id) return;
    setCheckinQRCode(null);
    setCopiedCheckinUrl(false);
    setGeneratingQRCode(true);
    try {
      const res = await api.post(
        `/training/plans/${plan.id}/checkin-qrcode/generate`,
        {},
        {
          headers: {
            'X-Frontend-URL': frontendBaseUrl(),
          },
        },
      );
      setCheckinQRCode(res.data);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        alert(err.response?.data?.detail || '產生報到 QRcode 失敗');
      } else {
        alert('產生報到 QRcode 失敗');
      }
      setQrPanelOpen(false);
    } finally {
      setGeneratingQRCode(false);
    }
  };

  const refreshBatchStats = useCallback(async (batchId: string) => {
    setBatchStatsLoading(true);
    try {
      const res = await api.get<AttendanceBatchStatsOut>(`/training/attendance/batches/${batchId}/stats`);
      setBatchStats(res.data);
      setBatchModal((prev) => (prev && prev.id === batchId ? { ...prev, status: res.data.status } : prev));
    } catch {
      /* keep previous stats on poll failure */
    } finally {
      setBatchStatsLoading(false);
    }
  }, []);

  const openBatchModal = useCallback(async (batch: AttendanceBatchOut) => {
    setBatchModal(batch);
    setBatchStats(null);
    setCopiedBatchUrl(false);
    await refreshBatchStats(batch.id);
  }, [refreshBatchStats]);

  const closeBatchModal = () => {
    setBatchModal(null);
    setBatchStats(null);
  };

  const loadBatchActivePlans = useCallback(async () => {
    setBatchSelectLoading(true);
    try {
      let activePlans: PlanSummary[];
      if (planStatusFilter === 'active') {
        activePlans = plans;
      } else {
        const res = await api.get<PlanSummary[]>('/training/plans', { params: { status: 'active' } });
        activePlans = res.data || [];
      }
      setBatchActivePlans(activePlans);
    } catch {
      setBatchActivePlans([]);
    } finally {
      setBatchSelectLoading(false);
    }
  }, [planStatusFilter, plans]);

  const batchCandidatePlans = useMemo(() => {
    return batchActivePlans.filter((p) =>
      matchesBatchCandidateFilter(
        {
          title: p.title,
          year: p.year ?? '',
          training_date: p.training_date,
          end_date: p.end_date,
        },
        {
          filterDate: batchFilterByDate ? batchSessionDate : '',
          keyword: batchKeyword,
        },
      ),
    );
  }, [batchActivePlans, batchFilterByDate, batchSessionDate, batchKeyword]);

  const batchSelectedPlans = useMemo(() => {
    const byId = new Map(batchActivePlans.map((p) => [p.id, p]));
    return batchSelectedIds
      .map((id) => byId.get(id))
      .filter((p): p is PlanSummary => Boolean(p));
  }, [batchActivePlans, batchSelectedIds]);

  const toggleBatchPlan = (planId: number) => {
    setBatchSelectedIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId],
    );
  };

  const openBatchSelectModal = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setBatchSessionDate(today);
    // 預設不依日期篩選，開啟即列出全部進行中計畫；需要時再開「用此日期篩選」
    setBatchFilterByDate(false);
    setBatchKeyword('');
    setBatchSelectedIds([]);
    setBatchLabel('');
    setBatchSelectOpen(true);
  };

  useEffect(() => {
    if (!batchSelectOpen) return;
    void loadBatchActivePlans();
  }, [batchSelectOpen, loadBatchActivePlans]);

  useEffect(() => {
    if (!batchModal) return;
    const active = batchModal.status === 'open' || batchModal.status === 'reopened';
    if (!active) return;
    const timer = window.setInterval(() => {
      void refreshBatchStats(batchModal.id);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [batchModal, refreshBatchStats]);

  const handleCreateBatch = async () => {
    if (batchSelectedIds.length < 2) {
      alert('請至少勾選 2 場訓練計畫');
      return;
    }
    const trimmedLabel = batchLabel.trim();
    if (trimmedLabel.length < 2) {
      alert('請輸入批次標籤（至少 2 個字）');
      return;
    }
    if (trimmedLabel.length > 50) {
      alert('批次標籤最多 50 個字');
      return;
    }
    setCreatingBatch(true);
    try {
      const res = await api.post<AttendanceBatchOut>(
        '/training/attendance/batches',
        {
          plan_ids: batchSelectedIds,
          label: trimmedLabel,
          training_date: batchSessionDate || format(new Date(), 'yyyy-MM-dd'),
        },
        {
          headers: { 'X-Frontend-URL': frontendBaseUrl() },
        },
      );
      setBatchSelectOpen(false);
      await openBatchModal(res.data);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        alert(err.response?.data?.detail || '建立合併報到失敗');
      } else {
        alert('建立合併報到失敗');
      }
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleBatchStatusChange = async (status: 'closed' | 'reopened') => {
    if (!batchModal) return;
    setBatchStatusUpdating(true);
    try {
      const res = await api.patch<AttendanceBatchOut>(
        `/training/attendance/batches/${batchModal.id}/status`,
        { status },
        { headers: { 'X-Frontend-URL': frontendBaseUrl() } },
      );
      setBatchModal((prev) => ({
        ...res.data,
        // 關閉時後端回傳 null，不從 prev 補回（避免顯示已失效的 URL）
        // 僅在開啟狀態且後端未給圖時，保留 prev 圖檔（開啟中不會清空）
        qrcode_url: res.data.status === 'closed' ? null : (res.data.qrcode_url ?? prev?.qrcode_url ?? null),
        checkin_url: res.data.checkin_url ?? null,
      }));
      await refreshBatchStats(res.data.id);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        alert(err.response?.data?.detail || '更新批次狀態失敗');
      } else {
        alert('更新批次狀態失敗');
      }
    } finally {
      setBatchStatusUpdating(false);
    }
  };

  const toggleHistory = async (empId: string) => {
    if (expandedHistoryEmpId === empId) {
      setExpandedHistoryEmpId(null);
      return;
    }
    setExpandedHistoryEmpId(empId);
    if (historyEventsMap[empId] || !modalPlanId) return;
    setLoadingHistoryEmpId(empId);
    try {
      const res = await api.get<AttendanceCheckinEvent[]>(
        `/training/plans/${modalPlanId}/attendance/events`,
        { params: { emp_id: empId } },
      );
      setHistoryEventsMap((prev) => ({ ...prev, [empId]: res.data || [] }));
    } catch {
      setHistoryEventsMap((prev) => ({ ...prev, [empId]: [] }));
    } finally {
      setLoadingHistoryEmpId(null);
    }
  };

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
      const planTitle = modalPlan?.title ?? `plan-${modalStats.plan_id}`;
      const fallbackName = `${planTitle}_報到清單_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
      const filename = parseFilenameFromContentDisposition(
        res.headers['content-disposition'] as string | undefined,
        fallbackName,
      );
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('列印失敗');
    }
  };

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/training/plans', {
        params: { status: planStatusFilter },
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
  }, [planStatusFilter]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) =>
      matchesPlanSearch(
        {
          title: p.title,
          year: p.year ?? '',
          training_date: p.training_date,
          end_date: p.end_date,
        },
        searchTerm,
      ),
    );
  }, [plans, searchTerm]);

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
    void fetchAllStats();
  }, [plans]);

  const openAttendanceModal = async (planId: number) => {
    setModalPlanId(planId);
    setExpandedHistoryEmpId(null);
    setHistoryEventsMap({});
    setLoadingHistoryEmpId(null);
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
    setListSearchTerm('');
    setListPage(1);
    setQrPanelOpen(false);
    setCheckinQRCode(null);
    setExpandedHistoryEmpId(null);
    setHistoryEventsMap({});
    setLoadingHistoryEmpId(null);
  };

  const modalPlan = modalPlanId ? plans.find((p) => p.id === modalPlanId) : null;
  /** 封存計畫僅能檢視統計，不可填寫／編輯未到原因 */
  const absenceReasonReadOnly =
    Boolean(modalPlan?.is_archived) || planStatusFilter === 'archived';

  type AttendanceListRow =
    | (AttendanceStats['checked_in_users'][number] & { kind: 'actual' })
    | (AttendanceStats['not_checked_in_users'][number] & { kind: 'absent' });

  const currentAttendanceList = useMemo((): AttendanceListRow[] => {
    if (!modalStats) return [];
    const expectedList: AttendanceListRow[] = [
      ...modalStats.checked_in_users.map((u) => ({ ...u, kind: 'actual' as const })),
      ...modalStats.not_checked_in_users.map((u) => ({ ...u, kind: 'absent' as const })),
    ];
    if (selectedAttendanceFilter === 'expected') return expectedList;
    if (selectedAttendanceFilter === 'actual') {
      return modalStats.checked_in_users.map((u) => ({ ...u, kind: 'actual' as const }));
    }
    if (selectedAttendanceFilter === 'absent') {
      return modalStats.not_checked_in_users
        .filter((u) => !u.absence_reason_code)
        .map((u) => ({ ...u, kind: 'absent' as const }));
    }
    return modalStats.not_checked_in_users
      .filter((u) => !!u.absence_reason_code)
      .map((u) => ({ ...u, kind: 'absent' as const }));
  }, [modalStats, selectedAttendanceFilter]);

  const filteredAttendanceList = useMemo(() => {
    const keyword = listSearchTerm.trim().toLowerCase();
    if (!keyword) return currentAttendanceList;
    return currentAttendanceList.filter((user) =>
      user.emp_id.toLowerCase().includes(keyword) ||
      user.name.toLowerCase().includes(keyword) ||
      user.dept_name.toLowerCase().includes(keyword)
    );
  }, [currentAttendanceList, listSearchTerm]);

  const listTotalPages = Math.max(1, Math.ceil(filteredAttendanceList.length / listPageSize));
  const listStartIndex = (listPage - 1) * listPageSize;
  const paginatedAttendanceList = useMemo(
    () => filteredAttendanceList.slice(listStartIndex, listStartIndex + listPageSize),
    [filteredAttendanceList, listStartIndex, listPageSize],
  );

  useEffect(() => {
    setListPage(1);
  }, [selectedAttendanceFilter, modalPlanId, listPageSize, listSearchTerm]);

  useEffect(() => {
    if (listPage > listTotalPages) {
      setListPage(listTotalPages);
    }
  }, [listPage, listTotalPages]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-1">報到總覽</h1>
            <p className="text-gray-500 font-medium">同時檢視多個訓練計畫的報到統計</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openBatchSelectModal}
          className="px-4 py-2.5 min-h-11 bg-white text-indigo-700 border-2 border-indigo-200 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors duration-200 shadow-sm cursor-pointer shrink-0 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <Layers className="w-4 h-4 shrink-0" />
          多場訓練合併報到
        </button>
      </header>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <select
          value={planStatusFilter}
          onChange={(e) => setPlanStatusFilter(e.target.value as PlanStatusFilter)}
          className="px-3 py-2.5 bg-white border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200 cursor-pointer"
        >
          <option value="active">正在進行中</option>
          <option value="expired">已過期</option>
          <option value="archived">已封存</option>
          <option value="all">全部</option>
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="search"
            placeholder="搜尋名稱、年份或訓練日期..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200"
          />
        </div>
        <button
          type="button"
          onClick={() => void fetchPlans()}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors duration-200 shadow-sm shadow-indigo-200 cursor-pointer shrink-0"
          title="重新載入"
        >
          更新
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-8 text-center text-gray-600">
          {plans.length === 0
            ? EMPTY_PLAN_MESSAGES[planStatusFilter]
            : '沒有符合搜尋條件的訓練計畫。'}
        </div>
      ) : (
        <>
          {loadingStats && (
            <div className="flex items-center gap-2 text-sm text-indigo-600 font-bold">
              <Loader2 className="w-4 h-4 animate-spin" />
              載入各計畫報到統計中…
            </div>
          )}
          {/* 手機直向：寬表需 overflow-x-auto，勿用 overflow-hidden */}
          <div className="border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 sm:px-4 py-3 text-left font-bold text-gray-700 whitespace-nowrap">訓練計畫</th>
                  <th className="px-3 sm:px-4 py-3 text-left font-bold text-gray-700 whitespace-nowrap">日期</th>
                  <th className="px-3 sm:px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">應到</th>
                  <th className="px-3 sm:px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">實到</th>
                  <th className="px-3 sm:px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">未到</th>
                  <th className="px-3 sm:px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">出席率</th>
                  <th className="px-3 sm:px-4 py-3 text-center font-bold text-gray-700 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPlans.map((plan) => {
                  const stats = statsMap[plan.id];
                  const absent = stats
                    ? Math.max(0, stats.expected_count - stats.actual_count)
                    : 0;
                  return (
                    <tr key={plan.id} className="even:bg-gray-100 hover:bg-indigo-50/30 transition-colors">
                      <td className="px-3 sm:px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{plan.title}</td>
                      <td className="px-3 sm:px-4 py-3 text-gray-600 whitespace-nowrap">{plan.training_date}</td>
                      <td className="px-3 sm:px-4 py-3 text-right font-mono whitespace-nowrap">{stats ? stats.expected_count : '-'}</td>
                      <td className="px-3 sm:px-4 py-3 text-right font-mono text-green-600 whitespace-nowrap">{stats ? stats.actual_count : '-'}</td>
                      <td className="px-3 sm:px-4 py-3 text-right font-mono text-orange-600 whitespace-nowrap">{stats ? absent : '-'}</td>
                      <td className="px-3 sm:px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">
                        {stats ? `${stats.attendance_rate.toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openAttendanceModal(plan.id)}
                          className="px-3 py-1.5 min-h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
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
            <div className="p-4 border-b border-indigo-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-linear-to-r from-indigo-50 to-purple-50">
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2 min-w-0">
                <BarChart3 className="w-5 h-5 text-indigo-600 shrink-0" />
                <span className="truncate">報到統計 - {modalPlan.title}</span>
              </h3>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => { void handleToggleQrPanel(modalPlan); }}
                  className={`px-3 py-1.5 min-h-11 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 ${
                    qrPanelOpen ? 'bg-indigo-700 text-white' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  {qrPanelOpen ? '隱藏 QRcode' : '顯示 QRcode'}
                </button>
                <button
                  type="button"
                  onClick={() => { void refreshModalStats(); }}
                  disabled={refreshingStats}
                  className="px-3 py-1.5 min-h-11 text-xs font-bold bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${refreshingStats ? 'animate-spin' : ''}`} />
                  更新
                </button>
                <button
                  type="button"
                  onClick={handlePrintCurrentList}
                  className="px-3 py-1.5 min-h-11 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  列印目前清單
                </button>
                <button type="button" onClick={closeModal} className="p-2 min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-white/50 rounded-xl cursor-pointer" aria-label="關閉">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {!modalStats ? (
                <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
              ) : (
                <>
                  {absenceReasonReadOnly && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                      此訓練計畫已封存，僅能檢視報到紀錄與未到名單，無法編輯未到原因。
                    </div>
                  )}
                  <div className={`flex flex-col ${qrPanelOpen ? 'lg:flex-row lg:items-stretch' : ''} gap-4 mb-6`}>
                  {qrPanelOpen && (
                    <div className="lg:flex-1 min-w-0 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 flex flex-col items-center justify-center gap-3">
                      {generatingQRCode ? (
                        <div className="flex items-center gap-2 text-gray-500 py-8">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>產生中…</span>
                        </div>
                      ) : checkinQRCode ? (
                        <>
                          <img src={checkinQRCode.qrcode_url} alt="報到 QRcode" className="w-44 h-44 shrink-0 rounded-lg bg-white p-1 border border-indigo-100" />
                          <p className="text-xs text-gray-600 text-center max-w-md">
                            掃描此 QRcode 或開啟連結即可報到（同一組 QR 供上課前與考試時重複使用；未登入將先導向登入頁）。人員報到後按上方「更新」重新整理統計。
                          </p>
                          <div className="flex items-center gap-2 text-xs w-full max-w-md">
                            <span className="font-mono text-gray-600 bg-white px-2 py-1 rounded border border-indigo-100 flex-1 truncate">
                              {checkinQRCode.checkin_url}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(checkinQRCode.checkin_url).then(() => {
                                  setCopiedCheckinUrl(true);
                                  setTimeout(() => setCopiedCheckinUrl(false), 2000);
                                });
                              }}
                              className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded transition-colors duration-200 cursor-pointer shrink-0"
                              title="複製連結"
                            >
                              {copiedCheckinUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                  <div className={`grid grid-cols-2 gap-2 ${qrPanelOpen ? 'lg:w-52 shrink-0 content-start' : 'sm:grid-cols-4 gap-4 flex-1'}`}>
                    <button
                      type="button"
                      onClick={() => { setSelectedAttendanceFilter('expected'); setListPage(1); }}
                      className={`${qrPanelOpen ? 'p-2.5' : 'p-4'} rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'expected', 'indigo')}`}
                    >
                      <div className={`${qrPanelOpen ? 'text-xs mb-0.5' : 'text-sm mb-1'} font-bold text-indigo-600`}>應到人數</div>
                      <div className={`${qrPanelOpen ? 'text-lg' : 'text-2xl'} font-black text-indigo-800`}>{modalStats.expected_count}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedAttendanceFilter('actual'); setListPage(1); }}
                      className={`${qrPanelOpen ? 'p-2.5' : 'p-4'} rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'actual', 'green')}`}
                    >
                      <div className={`${qrPanelOpen ? 'text-xs mb-0.5' : 'text-sm mb-1'} font-bold text-green-600`}>實到人數</div>
                      <div className={`${qrPanelOpen ? 'text-lg' : 'text-2xl'} font-black text-green-800`}>{modalStats.actual_count}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedAttendanceFilter('absent'); setListPage(1); }}
                      className={`${qrPanelOpen ? 'p-2.5' : 'p-4'} rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'absent', 'orange')}`}
                    >
                      <div className={`${qrPanelOpen ? 'text-xs mb-0.5' : 'text-sm mb-1'} font-bold text-orange-600`}>未到人數</div>
                      <div className={`${qrPanelOpen ? 'text-lg' : 'text-2xl'} font-black text-orange-800`}>{modalStats.absent_without_reason_count ?? Math.max(0, modalStats.expected_count - modalStats.actual_count)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedAttendanceFilter('leave'); setListPage(1); }}
                      className={`${qrPanelOpen ? 'p-2.5' : 'p-4'} rounded-xl text-left cursor-pointer transition-all ${getCardClass(selectedAttendanceFilter === 'leave', 'purple')}`}
                    >
                      <div className={`${qrPanelOpen ? 'text-xs mb-0.5' : 'text-sm mb-1'} font-bold text-purple-600`}>請假人數</div>
                      <div className={`${qrPanelOpen ? 'text-lg' : 'text-2xl'} font-black text-purple-800`}>{modalStats.leave_count ?? 0}</div>
                    </button>
                  </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-gray-700">
                        {selectedAttendanceFilter === 'expected' && `應到清單 (${modalStats.expected_count})`}
                        {selectedAttendanceFilter === 'actual' && `實到清單 (${modalStats.checked_in_users.length})`}
                        {selectedAttendanceFilter === 'absent' && `未到清單 (${modalStats.absent_without_reason_count ?? modalStats.not_checked_in_users.filter(u => !u.absence_reason_code).length})`}
                        {selectedAttendanceFilter === 'leave' && `請假清單 (${modalStats.leave_count ?? modalStats.not_checked_in_users.filter(u => u.absence_reason_code).length})`}
                        {listSearchTerm.trim() ? `（符合 ${filteredAttendanceList.length} 位）` : ''}
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
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="search"
                          placeholder="搜尋員工編號、姓名或部門..."
                          value={listSearchTerm}
                          onChange={(e) => setListSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all duration-200"
                        />
                      </div>
                      {/* 手機直向：寬表需 overflow-x-auto，勿用 overflow-hidden */}
                      <div className="border border-gray-200 rounded-xl overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">ITEM</th>
                              <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">員工編號</th>
                              <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">姓名</th>
                              <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">部門</th>
                              <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">
                                {selectedAttendanceFilter === 'actual'
                                  ? '報到時間'
                                  : selectedAttendanceFilter === 'expected'
                                    ? '報到時間／未到原因'
                                    : '未到原因'}
                              </th>
                              <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">歷程</th>
                              {!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' && (
                                <th className="px-3 sm:px-4 py-2 text-left text-xs font-bold text-gray-600 whitespace-nowrap">操作</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredAttendanceList.length === 0 ? (
                              <tr>
                                <td colSpan={!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' ? 7 : 6} className="px-3 sm:px-4 py-4 text-center text-gray-400 text-xs">
                                  {currentAttendanceList.length === 0 ? '查無資料' : '查無符合條件的人員'}
                                </td>
                              </tr>
                            ) : (
                              paginatedAttendanceList.map((rowUser, idx) => {
                                const displayIndex = listStartIndex + idx + 1;
                                const historyOpen = expandedHistoryEmpId === rowUser.emp_id;
                                const absenceLabel =
                                  'absence_reason_code' in rowUser && rowUser.absence_reason_code
                                    ? ABSENCE_REASON_OPTIONS.find((o) => o.code === rowUser.absence_reason_code)?.label
                                      || rowUser.absence_reason_code
                                    : null;
                                const absenceText =
                                  'absence_reason_text' in rowUser && rowUser.absence_reason_text
                                    ? rowUser.absence_reason_text
                                    : '';
                                const colSpan = !absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' ? 7 : 6;
                                return (
                                  <Fragment key={`${rowUser.emp_id}-${displayIndex}`}>
                                    <tr className="even:bg-gray-100">
                                      <td className="px-3 sm:px-4 py-2 font-mono text-xs whitespace-nowrap">{displayIndex}</td>
                                      <td className="px-3 sm:px-4 py-2 font-mono text-xs whitespace-nowrap">{rowUser.emp_id}</td>
                                      <td className="px-3 sm:px-4 py-2 font-bold whitespace-nowrap">{rowUser.name}</td>
                                      <td className="px-3 sm:px-4 py-2 text-gray-600 whitespace-nowrap">{rowUser.dept_name}</td>
                                      <td className="px-3 sm:px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                                        {rowUser.kind === 'actual' && 'checkin_time' in rowUser && rowUser.checkin_time
                                          ? parseBackendDateTime(rowUser.checkin_time)?.toLocaleString('zh-TW', { hour12: false })
                                          : (absenceLabel
                                              ? `${absenceLabel}${absenceText ? `：${absenceText}` : ''}`
                                              : '-')}
                                      </td>
                                      <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                                        {rowUser.kind === 'actual' ? (
                                          <button
                                            type="button"
                                            onClick={() => { void toggleHistory(rowUser.emp_id); }}
                                            className="px-2 py-1.5 min-h-11 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer inline-flex items-center gap-0.5"
                                          >
                                            {historyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                            歷程
                                          </button>
                                        ) : (
                                          <span className="text-gray-300 text-xs">—</span>
                                        )}
                                      </td>
                                      {!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' && rowUser.kind !== 'actual' && (
                                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                                          <button
                                            type="button"
                                            onClick={() => setAbsenceReasonEdit({
                                              empId: rowUser.emp_id,
                                              name: rowUser.name,
                                              reasonCode: 'absence_reason_code' in rowUser ? (rowUser.absence_reason_code || '') : '',
                                              reasonText: 'absence_reason_text' in rowUser ? (rowUser.absence_reason_text || '') : '',
                                            })}
                                            className="px-2 py-1.5 min-h-11 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                                          >
                                            {'absence_reason_code' in rowUser && rowUser.absence_reason_code ? '編輯原因' : '填寫原因'}
                                          </button>
                                        </td>
                                      )}
                                      {!absenceReasonReadOnly && selectedAttendanceFilter !== 'actual' && rowUser.kind === 'actual' && (
                                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap" />
                                      )}
                                    </tr>
                                    {historyOpen && (
                                      <tr className="bg-indigo-50/40">
                                        <td colSpan={colSpan} className="px-3 sm:px-4 py-3">
                                          {loadingHistoryEmpId === rowUser.emp_id ? (
                                            <div className="flex items-center gap-2 text-xs text-indigo-600">
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              載入歷程…
                                            </div>
                                          ) : (historyEventsMap[rowUser.emp_id]?.length ?? 0) === 0 ? (
                                            <p className="text-xs text-gray-400">尚無報到歷程</p>
                                          ) : (
                                            <ul className="space-y-1.5">
                                              {(historyEventsMap[rowUser.emp_id] || []).map((ev) => (
                                                <li key={ev.id} className="text-xs text-gray-700 flex flex-wrap gap-x-3 gap-y-0.5">
                                                  <span className="font-mono text-gray-500 shrink-0">
                                                    {ev.event_time
                                                      ? parseBackendDateTime(ev.event_time)?.toLocaleString('zh-TW', { hour12: false })
                                                      : '—'}
                                                  </span>
                                                  <span className="font-bold text-gray-800">
                                                    {formatAttendanceCheckinEventLabel(ev)}
                                                  </span>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {filteredAttendanceList.length > 0 && (
                        <Pagination
                          currentPage={listPage}
                          totalPages={listTotalPages}
                          pageSize={listPageSize}
                          totalItems={filteredAttendanceList.length}
                          onPageChange={setListPage}
                          onPageSizeChange={(size) => { setListPageSize(size); setListPage(1); }}
                        />
                      )}
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

      {/* 多場訓練合併報到 — 選取 Modal */}
      {batchSelectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-indigo-100 flex items-center justify-between bg-linear-to-r from-indigo-50 to-purple-50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                多場訓練合併報到
              </h3>
              <button type="button" onClick={() => setBatchSelectOpen(false)} className="p-2 min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-white/50 rounded-xl cursor-pointer" aria-label="關閉">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                先勾選至少 2 場再確認。可用「關鍵字」或「場次日」篩選（OR）；已選換條件不清空。
                「標籤」只是批次名稱，不會用來搜尋計畫。
              </p>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">關鍵字（搜尋計畫）</label>
                <input
                  type="search"
                  value={batchKeyword}
                  onChange={(e) => setBatchKeyword(e.target.value)}
                  placeholder="例如：AI、資安、2026；與場次日為 OR"
                  className="w-full px-3 py-2.5 border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">場次／報到日</label>
                <input
                  type="date"
                  value={batchSessionDate}
                  onChange={(e) => setBatchSessionDate(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
                <label className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer min-h-11">
                  <input
                    type="checkbox"
                    checked={batchFilterByDate}
                    onChange={(e) => setBatchFilterByDate(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 shrink-0"
                  />
                  用此日期篩選候選（落在開始～結束區間；與關鍵字為 OR）
                </label>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  標籤（批次名稱）<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="例如：0721 上午場、資安＋AI 合併"
                  maxLength={50}
                  required
                  className="w-full px-3 py-2.5 border-2 border-indigo-200 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              </div>

              {batchSelectedPlans.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-2">
                    已選合併（換篩選不清空）
                    <span className="text-indigo-600 font-bold ml-2">{batchSelectedPlans.length}</span>
                  </p>
                  <ul className="border-2 border-indigo-200 bg-indigo-50/40 rounded-xl divide-y divide-indigo-100">
                    {batchSelectedPlans.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 min-h-11">
                        <span className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">{p.title}</span>
                        <span className="text-xs text-gray-400 font-mono shrink-0">
                          {p.training_date}{p.end_date ? `～${p.end_date}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleBatchPlan(p.id)}
                          className="text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg cursor-pointer shrink-0"
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-sm font-bold text-gray-700 mb-2">
                  候選進行中計畫（至少合計已選 2 場）
                </p>
                {batchSelectLoading ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                ) : batchCandidatePlans.length === 0 ? (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-6 text-center text-sm text-gray-500">
                    {batchActivePlans.length === 0
                      ? '目前沒有進行中的訓練計畫'
                      : '沒有符合場次日或關鍵字的計畫（條件為 OR；可關閉「用此日期篩選」或改關鍵字）'}
                  </div>
                ) : (
                  <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {batchCandidatePlans.map((p) => {
                      const checked = batchSelectedIds.includes(p.id);
                      return (
                        <li key={p.id}>
                          <label className="flex items-center gap-3 px-3 py-3 hover:bg-indigo-50/40 cursor-pointer min-h-11">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBatchPlan(p.id)}
                              className="w-4 h-4 accent-indigo-600 shrink-0"
                            />
                            <span className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">{p.title}</span>
                            <span className="text-xs text-gray-400 font-mono shrink-0">
                              {p.training_date}{p.end_date ? `～${p.end_date}` : ''}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBatchSelectOpen(false)}
                className="px-4 py-2.5 text-gray-600 font-bold rounded-xl hover:bg-gray-100 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={creatingBatch || batchSelectedIds.length < 2 || batchLabel.trim().length < 2}
                onClick={() => { void handleCreateBatch(); }}
                className="px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-2"
              >
                {creatingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {creatingBatch ? '建立中…' : '確認合併報到'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 合併報到大 Modal */}
      {batchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-indigo-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-linear-to-r from-indigo-50 to-purple-50">
              <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2 min-w-0">
                <QrCode className="w-5 h-5 text-indigo-600 shrink-0" />
                <span className="truncate">{batchModal.label || '合併報到'}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                  batchModal.status === 'closed'
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {batchModal.status === 'closed' ? '已關閉' : batchModal.status === 'reopened' ? '已重開' : '進行中'}
                </span>
              </h3>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {batchModal.status === 'closed' ? (
                  <button
                    type="button"
                    disabled={batchStatusUpdating}
                    onClick={() => { void handleBatchStatusChange('reopened'); }}
                    className="px-3 py-1.5 min-h-11 text-xs font-bold bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 cursor-pointer"
                  >
                    重開
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={batchStatusUpdating}
                    onClick={() => { void handleBatchStatusChange('closed'); }}
                    className="px-3 py-1.5 min-h-11 text-xs font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 cursor-pointer"
                  >
                    關閉合併報到
                  </button>
                )}
                <button
                  type="button"
                  disabled={batchStatsLoading}
                  onClick={() => { void refreshBatchStats(batchModal.id); }}
                  className="px-3 py-1.5 min-h-11 text-xs font-bold bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${batchStatsLoading ? 'animate-spin' : ''}`} />
                  更新
                </button>
                <button type="button" onClick={closeBatchModal} className="p-2 min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-white/50 rounded-xl cursor-pointer" aria-label="關閉">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-72 shrink-0 flex flex-col items-center gap-3">
                  {batchModal.status === 'closed' ? (
                    <div className="w-56 h-56 rounded-xl bg-gray-100 border border-gray-200 flex flex-col items-center justify-center gap-2 opacity-60">
                      <QrCode className="w-20 h-20 text-gray-300" />
                    </div>
                  ) : batchModal.qrcode_url ? (
                    <img
                      src={batchModal.qrcode_url}
                      alt="合併報到 QRcode"
                      className="w-56 h-56 shrink-0 rounded-xl bg-white p-2 border border-indigo-100"
                    />
                  ) : (
                    <div className="w-56 h-56 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    </div>
                  )}
                  <p className="text-sm font-black text-gray-900 text-center">{batchModal.label}</p>
                  {batchModal.status !== 'closed' && batchModal.checkin_url && (
                    <div className="flex items-center gap-2 text-xs w-full">
                      <span className="font-mono text-gray-600 bg-indigo-50 px-2 py-1.5 rounded-lg border border-indigo-100 flex-1 truncate">
                        {batchModal.checkin_url}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!batchModal.checkin_url) return;
                          void navigator.clipboard.writeText(batchModal.checkin_url).then(() => {
                            setCopiedBatchUrl(true);
                            setTimeout(() => setCopiedBatchUrl(false), 2000);
                          });
                        }}
                        className="p-1.5 min-h-11 min-w-11 inline-flex items-center justify-center bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="複製連結"
                      >
                        {copiedBatchUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">各場報到統計</h4>
                  {!batchStats ? (
                    <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-x-auto">
                      <table className="w-full min-w-[28rem] text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-bold text-gray-700 whitespace-nowrap">訓練計畫</th>
                            <th className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">應到</th>
                            <th className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">實到</th>
                            <th className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">未到</th>
                            <th className="px-3 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">出席率</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {batchStats.plans.map((ps) => (
                            <tr key={ps.plan_id} className="even:bg-gray-50">
                              <td className="px-3 py-2.5 font-bold text-gray-900">{ps.title}</td>
                              <td className="px-3 py-2.5 text-right font-mono">{ps.expected_count}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-green-600">{ps.actual_count}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-orange-600">{ps.absent_count}</td>
                              <td className="px-3 py-2.5 text-right font-bold text-indigo-600">{ps.attendance_rate.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {batchModal.status === 'closed' && (
                    <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
                      此合併報到已關閉，員工掃描 QR 將無法報到。
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button type="button" onClick={closeBatchModal} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 cursor-pointer">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AttendanceOverviewPage;
