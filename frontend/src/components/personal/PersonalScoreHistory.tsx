import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, TrendingUp, Calendar, Eye } from 'lucide-react';
import clsx from 'clsx';
import PlanHistoryModal from './PlanHistoryModal';
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

interface PlanTrendData {
  plan_title: string;
  plan_id: number;
  record_id: number;
  trend: Array<{
    attempt: number;
    score: number;
    date: string;
    history_id?: number;
  }>;
}

interface PersonalScoreHistoryProps {
  empId?: string;
}

export default function PersonalScoreHistory({ empId }: PersonalScoreHistoryProps) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [plansData, setPlansData] = useState<Record<number, PlanTrendData>>({});
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'time' | 'score'>('time');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
        
        // 為每個計畫取得完整歷史
        if (data.records && data.records.length > 0) {
          await fetchPlansHistory(data.records);
        }
      }
    } catch (error) {
      console.error('Failed to fetch personal history', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlansHistory = async (records: HistoryRecord[]) => {
    try {
      const token = localStorage.getItem('token');
      const baseURL = `http://${window.location.hostname}:8000/api`;
      
      // 並行取得所有計畫的詳細資料
      const detailPromises = records.map(record =>
        fetch(`${baseURL}/exam/record/${record.record_id}/detail`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.ok ? res.json() : null)
      );
      
      const details = await Promise.all(detailPromises);
      
      // 轉換為 plansData 結構
      const newPlansData: Record<number, PlanTrendData> = {};
      let latestPlanId: number | null = null;
      let latestSubmitTime: string | null = null;
      
      details.forEach((detail, index) => {
        if (!detail || !detail.history) return;
        
        const record = records[index];
        const planId = record.plan_id;
        
        // 轉換 history 為 trend 格式
        const trend = detail.history.map((h: any, idx: number) => ({
          attempt: idx + 1,
          score: h.total_score,
          date: h.submit_time ? new Date(h.submit_time).toLocaleDateString('zh-TW') : '',
          history_id: h.id
        }));
        
        newPlansData[planId] = {
          plan_title: record.plan_title,
          plan_id: planId,
          record_id: record.record_id,
          trend
        };
        
        // 找出最近一次考試的計畫
        if (record.submit_time) {
          if (!latestSubmitTime || new Date(record.submit_time) > new Date(latestSubmitTime)) {
            latestSubmitTime = record.submit_time;
            latestPlanId = planId;
          }
        }
      });
      
      setPlansData(newPlansData);
      
      // 預設選中最近一次考試的計畫
      if (latestPlanId !== null) {
        setSelectedPlanIds(new Set([latestPlanId]));
      }
    } catch (error) {
      console.error('Failed to fetch plans history', error);
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

  // 顏色陣列
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#06b6d4', '#f97316', '#84cc16'];
  
  // 準備圖表資料（多線圖格式）
  const chartData: Array<Record<string, any>> = [];
  const maxAttempts = Math.max(
    ...Array.from(selectedPlanIds)
      .map(planId => plansData[planId]?.trend.length || 0)
      .filter(len => len > 0),
    0
  );
  
  // 為每個 attempt 建立資料點
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const dataPoint: Record<string, any> = { attempt };
    
    selectedPlanIds.forEach(planId => {
      const plan = plansData[planId];
      if (plan && plan.trend[attempt - 1]) {
        dataPoint[`plan_${planId}`] = plan.trend[attempt - 1].score;
      } else {
        dataPoint[`plan_${planId}`] = null;
      }
    });
    
    chartData.push(dataPoint);
  }
  
  // 處理計畫選擇
  const handlePlanToggle = (planId: number) => {
    const newSelected = new Set(selectedPlanIds);
    if (newSelected.has(planId)) {
      newSelected.delete(planId);
    } else {
      newSelected.add(planId);
    }
    setSelectedPlanIds(newSelected);
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto print:hidden">
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

      {/* 計畫選擇器 */}
      {Object.keys(plansData).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">選擇計畫</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.values(plansData).map((plan, index) => (
              <label
                key={plan.plan_id}
                className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedPlanIds.has(plan.plan_id)}
                  onChange={() => handlePlanToggle(plan.plan_id)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">{plan.plan_title}</div>
                  <div className="text-xs text-gray-500">
                    {plan.trend.length} 次考試
                  </div>
                </div>
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 成績趨勢圖 */}
      {chartData.length > 0 && selectedPlanIds.size > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">成績趨勢</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="attempt" 
                label={{ value: '考試次數', position: 'insideBottom', offset: -5 }} 
              />
              <YAxis 
                label={{ value: '分數', angle: -90, position: 'insideLeft' }} 
                domain={[0, 100]} 
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  if (value === null) return [null, ''];
                  const planId = parseInt(name.replace('plan_', ''));
                  const plan = plansData[planId];
                  return [value, plan?.plan_title || ''];
                }}
                labelFormatter={(label) => `第 ${label} 次考試`}
              />
              <Legend 
                formatter={(value: string) => {
                  const planId = parseInt(value.replace('plan_', ''));
                  const plan = plansData[planId];
                  return plan?.plan_title || '';
                }}
              />
              {Array.from(selectedPlanIds).map((planId, index) => {
                const plan = plansData[planId];
                if (!plan) return null;
                return (
                  <Line
                    key={planId}
                    type="monotone"
                    dataKey={`plan_${planId}`}
                    stroke={COLORS[index % COLORS.length]}
                    name={`plan_${planId}`}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls={false}
                  />
                );
              })}
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
                          setShowHistoryModal(true);
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

      {/* 考試歷程 Modal */}
      {selectedRecordId && (
        <PlanHistoryModal
          recordId={selectedRecordId}
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedRecordId(null);
          }}
        />
      )}
    </div>
  );
}
