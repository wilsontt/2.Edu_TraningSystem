import { useState, useEffect } from 'react';
import { Award, TrendingUp, Clock, Target, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../../api';

interface PersonalOverview {
  emp_id: string;
  completed_count: number;
  average_score: number;
  pass_rate: number;
  best_score: number;
  worst_score: number;
  total_study_time: number; // 秒數
}

type PlanStatusFilter = 'active' | 'expired' | 'archived' | 'all';

interface PersonalScoreOverviewProps {
  empId?: string;
  titlePrefix?: string;
  planStatus?: PlanStatusFilter;
  onNavigateHistory?: () => void;
}

export default function PersonalScoreOverview({
  empId,
  titlePrefix,
  planStatus = 'active',
  onNavigateHistory,
}: PersonalScoreOverviewProps) {
  const [overview, setOverview] = useState<PersonalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOverview(null);
    setError(null);
    setLoading(true);

    const fetchOverview = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseURL = API_BASE_URL;
        const params = new URLSearchParams();
        params.set('plan_status', planStatus);
        if (empId) {
          params.set('emp_id', empId);
        }
        const url = `${baseURL}/exam/personal/overview?${params.toString()}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.status === 403) {
          setError('無權查看該員工成績');
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as PersonalOverview;
          setOverview(data);
        } else {
          setError('無法載入資料');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to fetch personal overview', err);
        setError('無法載入資料');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchOverview();
    return () => controller.abort();
  }, [empId, planStatus]);

  const formatDuration = (seconds: number): string => {
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

  if (error) {
    return <div className="p-8 text-center text-red-600 font-medium">{error}</div>;
  }

  if (!overview) {
    return <div className="p-8 text-center text-gray-500">無法載入資料</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto print:hidden">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          {titlePrefix ? `${titlePrefix}的個人成績總覽` : '個人成績總覽'}
        </h2>
        <p className="text-gray-500 mt-1">
          {titlePrefix ? `查看 ${titlePrefix} 的學習成果與統計資料` : '查看您的學習成果與統計資料'}
        </p>
      </div>

      {/* KPI 卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: '已完成考試',
            value: overview.completed_count,
            sub: '場次（與歷史記錄筆數相同，相同計畫狀態篩選下）',
            icon: CheckCircle,
            color: 'text-blue-500',
            bgColor: 'bg-blue-50',
          },
          {
            title: '平均分數',
            value: `${overview.average_score.toFixed(1)}`,
            sub: '分',
            icon: TrendingUp,
            color: 'text-green-500',
            bgColor: 'bg-green-50',
          },
          {
            title: '通過率',
            value: `${overview.pass_rate.toFixed(1)}%`,
            sub: '總體',
            icon: Target,
            color: 'text-purple-500',
            bgColor: 'bg-purple-50',
          },
          {
            title: '最佳成績',
            value: overview.best_score,
            sub: '分',
            icon: Award,
            color: 'text-yellow-500',
            bgColor: 'bg-yellow-50',
          },
          {
            title: '最差成績',
            value: overview.worst_score,
            sub: '分',
            icon: XCircle,
            color: 'text-red-500',
            bgColor: 'bg-red-50',
          },
          {
            title: '總學習時數',
            value: formatDuration(overview.total_study_time),
            sub: '累積時間',
            icon: Clock,
            color: 'text-indigo-500',
            bgColor: 'bg-indigo-50',
          },
        ].map((kpi, idx) => (
          <button
            key={idx}
            type="button"
            onClick={idx === 0 ? onNavigateHistory : undefined}
            className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all text-left w-full ${
              idx === 0 && onNavigateHistory ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-gray-500">{kpi.title}</h3>
              <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 成績分布提示 */}
      {overview.completed_count > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Award className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
            <div>
              <h4 className="font-medium text-blue-900 mb-1">成績分析</h4>
              <p className="text-sm text-blue-700">
                您的平均分數為 <strong>{overview.average_score.toFixed(1)} 分</strong>，
                最佳成績為 <strong>{overview.best_score} 分</strong>，
                通過率為 <strong>{overview.pass_rate.toFixed(1)}%</strong>。
                {overview.pass_rate >= 80 && ' 表現優異！繼續保持！'}
                {overview.pass_rate >= 60 && overview.pass_rate < 80 && ' 表現良好，還有進步空間！'}
                {overview.pass_rate < 60 && ' 需要加強學習，加油！'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
