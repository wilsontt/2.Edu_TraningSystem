import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { API_BASE_URL } from '../../api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface CategoryAnalysis {
  category_id: number;
  category_name: string;
  avg_score: number;
  count: number;
}

interface PersonalAnalysis {
  emp_id: string;
  progress: {
    completed: number;
    total: number;
    progress_rate: number;
  };
  strong_areas: CategoryAnalysis[];
  weak_areas: CategoryAnalysis[];
  category_analysis: CategoryAnalysis[];
  trend_data: Array<{
    month: string;
    year: number;
    month_num: number;
    avg_score: number;
    count: number;
  }>;
}

type PlanStatusFilter = 'active' | 'expired' | 'archived' | 'all';

interface PersonalLearningAnalysisProps {
  empId?: string;
  titlePrefix?: string;
  planStatus?: PlanStatusFilter;
}

export default function PersonalLearningAnalysis({
  empId,
  titlePrefix,
  planStatus = 'active',
}: PersonalLearningAnalysisProps) {
  const [analysis, setAnalysis] = useState<PersonalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<number>(6);
  const trendChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const scrollPosition = trendChartRef.current
      ? trendChartRef.current.getBoundingClientRect().top + window.scrollY
      : null;

    setAnalysis(null);
    setError(null);
    setLoading(true);

    const fetchAnalysis = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseURL = API_BASE_URL;
        const params = new URLSearchParams({
          trend_period: String(trendPeriod),
          plan_status: planStatus,
        });
        if (empId) {
          params.set('emp_id', empId);
        }
        const response = await fetch(`${baseURL}/exam/personal/analysis?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.status === 403) {
          setError('無權查看該員工成績');
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as PersonalAnalysis;
          setAnalysis(data);

          if (scrollPosition !== null) {
            setTimeout(() => {
              window.scrollTo({
                top: scrollPosition - 100,
                behavior: 'instant',
              });
            }, 0);
          }
        } else {
          setError('無法載入資料');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to fetch personal analysis', err);
        setError('無法載入資料');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchAnalysis();
    return () => controller.abort();
  }, [empId, planStatus, trendPeriod]);

  if (loading) {
    return <div className="p-8 flex justify-center text-gray-500">載入中...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600 font-medium">{error}</div>;
  }

  if (!analysis) {
    return <div className="p-8 text-center text-gray-500">無法載入資料</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto print:hidden">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          {titlePrefix ? `${titlePrefix}的個人學習分析` : '個人學習分析'}
        </h2>
        <p className="text-gray-500 mt-1">
          {titlePrefix
            ? `深入了解 ${titlePrefix} 的學習狀況與進步軌跡`
            : '深入了解您的學習狀況與進步軌跡'}
        </p>
      </div>

      {/* 學習進度 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Target className="mr-2 h-5 w-5 text-blue-500" />
            學習進度
          </h3>
          <span className="text-2xl font-bold text-blue-600">
            {analysis.progress.completed} / {analysis.progress.total}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-blue-600 h-4 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(analysis.progress.progress_rate, 100)}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          已完成計畫 / 應考計畫（與歷史記錄「場次」不同；同計畫重考只計 1 個計畫）
        </p>
        <p className="text-sm text-gray-500">
          完成率：{Math.min(analysis.progress.progress_rate, 100).toFixed(1)}%
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
            擅長領域
          </h3>
          {analysis.strong_areas.length === 0 ? (
            <p className="text-gray-500 text-sm">目前沒有擅長的領域（平均分數 ≥ 80）</p>
          ) : (
            <div className="space-y-3">
              {analysis.strong_areas.map((area) => (
                <div
                  key={area.category_id}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">{area.category_name}</div>
                    <div className="text-xs text-gray-500">{area.count} 次考試</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">{area.avg_score}</div>
                    <div className="text-xs text-gray-500">平均分</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <TrendingDown className="mr-2 h-5 w-5 text-red-500" />
            需要加強的領域
          </h3>
          {analysis.weak_areas.length === 0 ? (
            <p className="text-gray-500 text-sm">目前沒有需要特別加強的領域（平均分數 {'<'} 60）</p>
          ) : (
            <div className="space-y-3">
              {analysis.weak_areas.map((area) => (
                <div
                  key={area.category_id}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">{area.category_name}</div>
                    <div className="text-xs text-gray-500">{area.count} 次考試</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-600">{area.avg_score}</div>
                    <div className="text-xs text-gray-500">平均分</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {analysis.category_analysis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">各分類成績分析</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analysis.category_analysis}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category_name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avg_score" fill="#3b82f6" name="平均分數" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {analysis.trend_data.length > 0 && (
        <div ref={trendChartRef} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold text-gray-900">成績趨勢</h3>
            <div className="flex gap-2 bg-gray-100 rounded-lg p-1 w-fit">
              <button
                onClick={() => setTrendPeriod(3)}
                className={`shrink-0 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  trendPeriod === 3
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                3 個月
              </button>
              <button
                onClick={() => setTrendPeriod(6)}
                className={`shrink-0 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  trendPeriod === 6
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                6 個月
              </button>
              <button
                onClick={() => setTrendPeriod(12)}
                className={`shrink-0 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  trendPeriod === 12
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                1 年
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analysis.trend_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avg_score" fill="#10b981" name="平均分數" />
              <Bar dataKey="count" fill="#f59e0b" name="考試次數" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
