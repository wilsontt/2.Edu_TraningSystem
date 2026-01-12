import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, TrendingUp, Calendar, Eye } from 'lucide-react';
import clsx from 'clsx';
import ScoreDetailModal from './ScoreDetailModal';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

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
}

export default function PersonalScoreHistory({ empId }: PersonalScoreHistoryProps) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'time' | 'score'>('time');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [sortBy, order, page, empId]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        sort_by: sortBy,
        order: order,
        page: page.toString(),
        page_size: pageSize.toString()
      });
      if (empId) {
        params.append('emp_id', empId);
      }
      const baseURL = `http://${window.location.hostname}:8000/api`;
      const response = await fetch(
        `${baseURL}/exam/personal/history?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch personal history', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return <div className="p-8 flex justify-center text-gray-500">載入中...</div>;
  }

  if (!history) {
    return <div className="p-8 text-center text-gray-500">無法載入資料</div>;
  }

  // 準備趨勢圖資料（按時間排序）
  const trendData = [...history.records]
    .filter(r => r.submit_time)
    .sort((a, b) => {
      if (!a.submit_time || !b.submit_time) return 0;
      return new Date(a.submit_time).getTime() - new Date(b.submit_time).getTime();
    })
    .map((r, idx) => ({
      index: idx + 1,
      score: r.score,
      date: r.submit_time ? new Date(r.submit_time).toLocaleDateString() : ''
    }));

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">個人成績歷史</h2>
        <p className="text-gray-500 mt-1">查看您的所有考試記錄</p>
      </div>

      {/* 排序控制 */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <label className="text-sm font-medium text-gray-700">排序方式：</label>
        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as 'time' | 'score');
            setPage(1);
          }}
          className="text-sm border border-gray-300 rounded-md px-3 py-1"
        >
          <option value="time">時間</option>
          <option value="score">分數</option>
        </select>
        <select
          value={order}
          onChange={(e) => {
            setOrder(e.target.value as 'asc' | 'desc');
            setPage(1);
          }}
          className="text-sm border border-gray-300 rounded-md px-3 py-1"
        >
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
        <div className="ml-auto text-sm text-gray-500">
          共 {history.total} 筆記錄
        </div>
      </div>

      {/* 成績趨勢圖 */}
      {trendData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">成績趨勢</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" label={{ value: '考試順序', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: '分數', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="score" stroke="#3b82f6" name="分數" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 成績列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-500">計畫名稱</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">分數</th>
                <th className="px-6 py-4 text-center text-sm font-bold text-gray-500">狀態</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">作答時間</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">提交時間</th>
                <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">重考次數</th>
                <th className="px-6 py-4 text-center text-sm font-bold text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    目前沒有考試記錄
                  </td>
                </tr>
              ) : (
                history.records.map((record) => (
                  <tr key={record.record_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{record.plan_title}</td>
                    <td className={clsx(
                      "px-6 py-4 text-right font-bold",
                      record.score >= 60 ? "text-green-600" : "text-red-500"
                    )}>
                      {record.score}
                    </td>
                    <td className="px-6 py-4 text-center">
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
                    <td className="px-6 py-4 text-right text-gray-700">
                      {formatDuration(record.duration)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 text-sm">
                      {record.submit_time ? new Date(record.submit_time).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-700">
                      {record.attempts}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedRecordId(record.record_id);
                          setShowDetailModal(true);
                        }}
                        className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        查看詳情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分頁控制 */}
        {history.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              顯示第 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, history.total)} 筆，共 {history.total} 筆
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一頁
              </button>
              <span className="px-3 py-1 text-sm text-gray-700">
                第 {page} / {history.total_pages} 頁
              </span>
              <button
                onClick={() => setPage(p => Math.min(history.total_pages, p + 1))}
                disabled={page === history.total_pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 成績詳情 Modal */}
      {selectedRecordId && (
        <ScoreDetailModal
          recordId={selectedRecordId}
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedRecordId(null);
          }}
        />
      )}
    </div>
  );
}
