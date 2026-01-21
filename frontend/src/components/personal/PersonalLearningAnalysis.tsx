import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, BookOpen } from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface PersonalLearningAnalysisProps {
  empId?: string;
}

export default function PersonalLearningAnalysis({ empId }: PersonalLearningAnalysisProps) {
  const [analysis, setAnalysis] = useState<PersonalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalysis();
  }, [empId]);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = `http://${window.location.hostname}:8000/api`;
      const url = empId
        ? `${baseURL}/exam/personal/analysis?emp_id=${empId}`
        : `${baseURL}/exam/personal/analysis`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
      }
    } catch (error) {
      console.error('Failed to fetch personal analysis', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center text-gray-500">載入中...</div>;
  }

  if (!analysis) {
    return <div className="p-8 text-center text-gray-500">無法載入資料</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto print:hidden">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">個人學習分析</h2>
        <p className="text-gray-500 mt-1">深入了解您的學習狀況與進步軌跡</p>
      </div>

      {/* 學習進度 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
            style={{ width: `${analysis.progress.progress_rate}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          完成率：{analysis.progress.progress_rate.toFixed(1)}%
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 擅長領域 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
            擅長領域
          </h3>
          {analysis.strong_areas.length === 0 ? (
            <p className="text-gray-500 text-sm">目前沒有擅長的領域（平均分數 ≥ 80）</p>
          ) : (
            <div className="space-y-3">
              {analysis.strong_areas.map((area) => (
                <div key={area.category_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
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

        {/* 需要加強的領域 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <TrendingDown className="mr-2 h-5 w-5 text-red-500" />
            需要加強的領域
          </h3>
            {analysis.weak_areas.length === 0 ? (
              <p className="text-gray-500 text-sm">目前沒有需要特別加強的領域（平均分數 {'<'} 60）</p>
            ) : (
            <div className="space-y-3">
              {analysis.weak_areas.map((area) => (
                <div key={area.category_id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
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

      {/* 分類成績分析圖表 */}
      {analysis.category_analysis.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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

      {/* 成績趨勢圖 */}
      {analysis.trend_data.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">過去 6 個月成績趨勢</h3>
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
