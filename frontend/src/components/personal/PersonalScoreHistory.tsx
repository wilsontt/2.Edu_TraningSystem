import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Eye, Search, Repeat } from 'lucide-react';
import clsx from 'clsx';
import { API_BASE_URL } from '../../api';
import PlanHistoryModal from './PlanHistoryModal';
import AuthorizeRetakeModal from '../exam/AuthorizeRetakeModal';
import Pagination from '../common/Pagination';
import { parseBackendDateTime } from '../../utils/date';

interface HistoryRecord {
  record_id: number;
  plan_id: number;
  plan_title: string;
  score: number;
  is_passed: boolean;
  start_time: string | null;
  submit_time: string | null;
  duration: number | null; // 秒數
  attempts: number;
  retake_authorized: boolean;
  emp_id?: string;
  name?: string;
  dept_name?: string;
}

interface HistoryResponse {
  emp_id: string;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  records: HistoryRecord[];
}

interface PersonalScoreHistoryProps {
  empId?: string;
  titlePrefix?: string;
  canAuthorizeRetake?: boolean;
}

type HistorySortKey = 'time' | 'score' | 'plan' | 'name' | 'dept' | 'attempts';

export default function PersonalScoreHistory({ empId, titlePrefix, canAuthorizeRetake = false }: PersonalScoreHistoryProps) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<HistorySortKey>('time');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [authorizeTarget, setAuthorizeTarget] = useState<{ empId: string; planId: number; empName: string; planTitle: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null);
    setLoading(true);

    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          sort_by: sortBy,
          order: order,
          page: page.toString(),
          page_size: pageSize.toString(),
        });
        if (keyword.trim()) {
          params.append('keyword', keyword.trim());
        }
        if (empId) {
          params.append('emp_id', empId);
        }
        const baseURL = API_BASE_URL;
        const response = await fetch(`${baseURL}/exam/personal/history?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = (await response.json()) as HistoryResponse;
          setHistory(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch personal history', error);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchHistory();
    return () => controller.abort();
  }, [sortBy, order, page, pageSize, keyword, empId, refreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  useEffect(() => {
    setPage(1);
  }, [keyword, sortBy, order, pageSize]);

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (minutes < 60) return `${minutes}分${secs}秒`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小時${mins}分`;
  };

  if (loading && !history) {
    return <div className="p-8 flex justify-center text-gray-500">載入中...</div>;
  }

  if (!history) {
    return <div className="p-8 text-center text-gray-500">無法載入資料</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto print:hidden">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          {titlePrefix ? `${titlePrefix}的個人成績歷史` : '個人成績歷史'}
        </h2>
        <p className="text-gray-500 mt-1">
          {titlePrefix ? `查看 ${titlePrefix} 的所有考試記錄` : '查看您的所有考試記錄'}
        </p>
      </div>

      {/* 排序與關鍵字 */}
      <div className="flex flex-col gap-3 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="搜尋部門、員工編號、姓名、計畫名稱…"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-gray-700">排序欄位：</label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as HistorySortKey);
            }}
            className="text-sm border border-gray-300 rounded-md px-3 py-1"
          >
            <option value="time">提交時間</option>
            <option value="score">成績分數</option>
            <option value="plan">授課計畫名稱</option>
            <option value="name">姓名</option>
            <option value="dept">部門名稱</option>
            <option value="attempts">考試次數</option>
          </select>
          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value as 'asc' | 'desc');
            }}
            className="text-sm border border-gray-300 rounded-md px-3 py-1"
          >
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <div className="ml-auto text-sm text-gray-500">共 {history.total} 筆記錄</div>
        </div>
      </div>

      {/* 成績列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-4 text-left text-sm font-bold text-gray-500">ITEM序號</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-gray-500">員工編號</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-gray-500">姓名</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-gray-500">部門名稱</th>
                <th className="px-4 py-4 text-left text-sm font-bold text-gray-500">授課計畫名稱</th>
                <th className="px-4 py-4 text-right text-sm font-bold text-gray-500">成績分數</th>
                <th className="px-4 py-4 text-center text-sm font-bold text-gray-500">狀態</th>
                <th className="px-4 py-4 text-right text-sm font-bold text-gray-500">作答時間</th>
                <th className="px-4 py-4 text-right text-sm font-bold text-gray-500">提交時間</th>
                <th className="px-4 py-4 text-right text-sm font-bold text-gray-500">考試次數</th>
                <th className="px-4 py-4 text-center text-sm font-bold text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                    目前沒有考試記錄
                  </td>
                </tr>
              ) : (
                history.records.map((record, idx) => (
                  <tr
                    key={record.record_id}
                    className={clsx(
                      'hover:bg-gray-50 transition-colors',
                      idx % 2 === 1 ? 'bg-gray-100' : 'bg-white'
                    )}
                  >
                    <td className="px-4 py-4 text-sm text-gray-600 tabular-nums">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-800">{record.emp_id ?? history.emp_id}</td>
                    <td className="px-4 py-4 text-sm text-gray-800">{record.name ?? '—'}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{record.dept_name ?? '—'}</td>
                    <td className="px-4 py-4 font-medium text-gray-900">{record.plan_title}</td>
                    <td className={clsx(
                      "px-4 py-4 text-right font-bold",
                      record.is_passed ? "text-green-600" : "text-red-500"
                    )}>
                      {record.score}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {record.is_passed ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          通過
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <XCircle className="h-3 w-3 mr-1" />
                          未通過
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-700">
                      {formatDuration(record.duration)}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-500 text-sm">
                      {record.submit_time ? parseBackendDateTime(record.submit_time)?.toLocaleString('zh-TW', { hour12: false }) : '-'}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-700">
                      {record.attempts}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setSelectedRecordId(record.record_id);
                            setShowHistoryModal(true);
                          }}
                          className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          查看詳情
                        </button>
                        {canAuthorizeRetake && record.is_passed && !record.retake_authorized && (
                          <button
                            onClick={() => setAuthorizeTarget({
                              empId: record.emp_id || empId || '',
                              planId: record.plan_id,
                              empName: record.name || titlePrefix || '',
                              planTitle: record.plan_title,
                            })}
                            className="inline-flex items-center px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
                          >
                            <Repeat className="h-4 w-4 mr-1" />
                            開放重考
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {history.total > 0 && (
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, history.total_pages)}
            pageSize={pageSize}
            totalItems={history.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>

      {/* 考試歷程 Modal */}
      {selectedRecordId && (
        <PlanHistoryModal
          recordId={selectedRecordId}
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedRecordId(null);
          }}
          targetEmpId={empId}
        />
      )}

      {/* 授權重考 Modal */}
      {authorizeTarget && (
        <AuthorizeRetakeModal
          empId={authorizeTarget.empId}
          planId={authorizeTarget.planId}
          empName={authorizeTarget.empName}
          planTitle={authorizeTarget.planTitle}
          onSuccess={() => {
            setAuthorizeTarget(null);
            setRefreshKey(k => k + 1);
          }}
          onClose={() => setAuthorizeTarget(null)}
        />
      )}
    </div>
  );
}
