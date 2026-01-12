import { useState, useEffect } from 'react';
import { Download, Users, FileText, CheckCircle, TrendingUp, AlertCircle, RefreshCw, Calendar, Timer, Target, Repeat, X, ChevronDown, ChevronRight, Filter, Award, TrendingDown, Eye } from "lucide-react";
import clsx from 'clsx';
import { format } from "date-fns";
import { Link } from 'react-router-dom';

// 導入 recharts
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// 定義型別
interface OverviewStats {
  total_exams: number;
  total_records: number;
  average_score: number;
  pass_rate: number;
  monthly_new_exams: number;
  monthly_records: number;
  pending_exam_count: number;
  avg_exam_duration: number; // 秒數
  completion_rate: number;
  retake_rate: number;
}

interface DepartmentStat {
  dept_id?: number;
  name: string;
  count: number;
  avg_score: number;
  pass_rate: number;
  completion_rate?: number;
  rank?: number;
  growth_rate?: number | null;
  score_distribution?: {
    "0-59": number;
    "60-69": number;
    "70-79": number;
    "80-89": number;
    "90-100": number;
  };
  top_users?: Array<{
    emp_id: string;
    name: string;
    avg_score: number;
    count: number;
  }>;
}

interface PlanStat {
  plan_id?: number;
  name: string;
  date: string;
  count: number;
  avg_score: number;
  pass_rate: number;
  completion_rate?: number;
  effectiveness_grade?: string; // A/B/C/D
  popularity_score?: number;
}

interface TrendData {
  month: string;
  year: number;
  month_num: number;
  count: number;
  avg_score: number;
  pass_rate: number;
}

interface DepartmentComparison {
  name: string;
  count: number;
  avg_score: number;
  pass_rate: number;
  completion_rate: number;
}

interface PlanPopularity {
  popularity_ranking: Array<{
    plan_id: number;
    plan_title: string;
    count: number;
    avg_score: number;
  }>;
  score_ranking: Array<{
    plan_id: number;
    plan_title: string;
    count: number;
    avg_score: number;
  }>;
}

interface ActiveExam {
  plan_id: number;
  title: string;
  training_date: string | null;
  end_date: string | null;
  target_count: number;
  completed_count: number;
  remaining_days: number | null;
}

interface ExpiringExam {
  plan_id: number;
  title: string;
  end_date: string;
  remaining_days: number;
  target_count: number;
  completed_count: number;
  pending_count: number;
}

interface RetakeUser {
  emp_id: string;
  name: string;
  dept_name: string;
  plans: Array<{
    plan_id: number;
    plan_title: string;
    score: number;
    passing_score: number;
    submit_time: string;
    attempts: number;
  }>;
}

export default function ReportDashboard() {
  const [overview, setOverview] = useState<OverviewStats>({
    total_exams: 0,
    total_records: 0,
    average_score: 0,
    pass_rate: 0,
    monthly_new_exams: 0,
    monthly_records: 0,
    pending_exam_count: 0,
    avg_exam_duration: 0,
    completion_rate: 0,
    retake_rate: 0
  });
  const [deptStats, setDeptStats] = useState<DepartmentStat[]>([]);
  const [planStats, setPlanStats] = useState<PlanStat[]>([]);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [deptComparison, setDeptComparison] = useState<DepartmentComparison[]>([]);
  const [planPopularity, setPlanPopularity] = useState<PlanPopularity | null>(null);
  const [activeExams, setActiveExams] = useState<{ count: number; exams: ActiveExam[] }>({ count: 0, exams: [] });
  const [expiringExams, setExpiringExams] = useState<{ count: number; exams: ExpiringExam[] }>({ count: 0, exams: [] });
  const [retakeUsers, setRetakeUsers] = useState<{ count: number; users: RetakeUser[] }>({ count: 0, users: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'department' | 'plan'>('department');
  const [trendMonths, setTrendMonths] = useState(6);
  const [timeFilter, setTimeFilter] = useState<{ type: 'all' | 'year' | 'quarter' | 'month'; year?: number; quarter?: number; month?: number }>({ type: 'all' });
  const [includeAdvanced, setIncludeAdvanced] = useState(true);
  const [expandedDept, setExpandedDept] = useState<number | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [deptDetails, setDeptDetails] = useState<Record<number, any>>({});
  const [planDetails, setPlanDetails] = useState<Record<number, any>>({});

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendMonths, timeFilter, includeAdvanced]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // 建立時間篩選參數
      const baseURL = `http://${window.location.hostname}:8000/api`;
      let deptUrl = `${baseURL}/admin/reports/department`;
      let planUrl = `${baseURL}/admin/reports/plan`;
      const params = new URLSearchParams();
      
      if (timeFilter.type === 'year' && timeFilter.year) {
        params.append('year', timeFilter.year.toString());
      } else if (timeFilter.type === 'quarter' && timeFilter.year && timeFilter.quarter) {
        params.append('year', timeFilter.year.toString());
        params.append('quarter', timeFilter.quarter.toString());
      } else if (timeFilter.type === 'month' && timeFilter.year && timeFilter.month) {
        params.append('year', timeFilter.year.toString());
        params.append('month', timeFilter.month.toString());
      }
      
      if (includeAdvanced) {
        params.append('include_advanced', 'true');
      }
      
      if (params.toString()) {
        deptUrl += '?' + params.toString();
      }

      const [
        overviewRes, 
        deptRes, 
        planRes, 
        trendsRes, 
        deptCompRes, 
        planPopRes,
        activeRes,
        expiringRes,
        retakeRes
      ] = await Promise.all([
        fetch(`${baseURL}/admin/reports/overview`, { headers }),
        fetch(deptUrl, { headers }),
        fetch(planUrl, { headers }),
        fetch(`${baseURL}/admin/reports/trends?months=${trendMonths}`, { headers }),
        fetch(`${baseURL}/admin/reports/department-comparison`, { headers }),
        fetch(`${baseURL}/admin/reports/plan-popularity?limit=10`, { headers }),
        fetch(`${baseURL}/admin/reports/active-exams`, { headers }),
        fetch(`${baseURL}/admin/reports/expiring-soon?days=3`, { headers }),
        fetch(`${baseURL}/admin/reports/retake-needed`, { headers })
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (deptRes.ok) setDeptStats(await deptRes.json());
      if (planRes.ok) setPlanStats(await planRes.json());
      if (trendsRes.ok) setTrends(await trendsRes.json());
      if (deptCompRes.ok) setDeptComparison(await deptCompRes.json());
      if (planPopRes.ok) setPlanPopularity(await planPopRes.json());
      if (activeRes.ok) setActiveExams(await activeRes.json());
      if (expiringRes.ok) setExpiringExams(await expiringRes.json());
      if (retakeRes.ok) setRetakeUsers(await retakeRes.json());

    } catch (error) {
      console.error("Failed to fetch report data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const token = localStorage.getItem('token');
      const baseURL = `http://${window.location.hostname}:8000/api`;
      const response = await fetch(`${baseURL}/admin/reports/export/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${format(new Date(), 'yyyyMMdd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export error", error);
      alert("導出失敗");
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (minutes < 60) return `${minutes}分${secs}秒`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小時${mins}分`;
  };

  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);
  const [showKPIModal, setShowKPIModal] = useState(false);

  const handleKPIClick = (kpiType: string) => {
    // 點擊 KPI 卡片時的鑽取功能
    setSelectedKPI(kpiType);
    setShowKPIModal(true);
  };

  const getKPIDetails = (kpiType: string) => {
    const details: Record<string, { description: string; value: string | number; unit?: string }> = {
      "總考試場次": {
        description: "所有已建立的訓練計畫總數",
        value: overview.total_exams,
        unit: "場次"
      },
      "總應考人次": {
        description: "所有考試記錄的總人次",
        value: overview.total_records,
        unit: "人次"
      },
      "平均分數": {
        description: "所有考試記錄的平均分數",
        value: overview.average_score.toFixed(1),
        unit: "分"
      },
      "及格率": {
        description: "通過考試（分數≥及格分數）的百分比",
        value: overview.pass_rate.toFixed(1),
        unit: "%"
      },
      "本月新增": {
        description: "本月新增的訓練計畫數量",
        value: overview.monthly_new_exams,
        unit: "場次"
      },
      "本月應考": {
        description: "本月完成的考試人次",
        value: overview.monthly_records,
        unit: "人次"
      },
      "待考試": {
        description: "已指派但尚未完成考試的人數",
        value: overview.pending_exam_count,
        unit: "人"
      },
      "平均作答": {
        description: "平均每次考試的作答時間",
        value: formatDuration(overview.avg_exam_duration),
        unit: ""
      },
      "完成率": {
        description: "已完成考試人數 / 應考人數",
        value: overview.completion_rate.toFixed(1),
        unit: "%"
      },
      "補考率": {
        description: "需要補考的人次占比",
        value: overview.retake_rate.toFixed(1),
        unit: "%"
      }
    };
    return details[kpiType] || { description: "無詳細資訊", value: "-", unit: "" };
  };

  if (loading) {
    return <div className="p-8 flex justify-center text-gray-500">載入中...</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">成績中心 統計報表</h2>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium shadow-sm"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            重新整理
          </button>
          <button 
            onClick={handleExportPDF} 
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            <Download className="mr-2 h-4 w-4" />
            匯出 PDF
          </button>
        </div>
      </div>

      {/* T1.4: KPI 卡片優化 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* 原有 4 個 KPI 卡片（優化版） */}
        {[
          { 
            title: "總考試場次", 
            value: overview.total_exams, 
            sub: "所有計畫", 
            icon: FileText, 
            color: "text-blue-500",
            bgColor: "bg-blue-50",
            trend: null
          },
          { 
            title: "總應考人次", 
            value: overview.total_records, 
            sub: "累積人次", 
            icon: Users, 
            color: "text-green-500",
            bgColor: "bg-green-50",
            trend: null
          },
          { 
            title: "平均分數", 
            value: `${overview.average_score.toFixed(1)}`, 
            sub: "分", 
            icon: TrendingUp, 
            color: "text-yellow-500",
            bgColor: "bg-yellow-50",
            trend: null
          },
          { 
            title: "及格率", 
            value: `${overview.pass_rate.toFixed(1)}%`, 
            sub: "總體", 
            icon: CheckCircle, 
            color: "text-red-500",
            bgColor: "bg-red-50",
            trend: null
          },
        ].map((kpi, idx) => (
          <div 
            key={idx} 
            onClick={() => handleKPIClick(kpi.title)}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-gray-500">{kpi.title}</h3>
              <div className={`p-2 rounded-lg ${kpi.bgColor} group-hover:scale-110 transition-transform`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
            </div>
          </div>
        ))}

        {/* T1.4.2: 新增的 KPI 卡片 */}
        {[
          { 
            title: "本月新增", 
            value: overview.monthly_new_exams, 
            sub: "考試場次", 
            icon: Calendar, 
            color: "text-purple-500",
            bgColor: "bg-purple-50"
          },
          { 
            title: "本月應考", 
            value: overview.monthly_records, 
            sub: "人次", 
            icon: Users, 
            color: "text-indigo-500",
            bgColor: "bg-indigo-50"
          },
          { 
            title: "待考試", 
            value: overview.pending_exam_count, 
            sub: "人數", 
            icon: Target, 
            color: "text-orange-500",
            bgColor: "bg-orange-50"
          },
          { 
            title: "平均作答", 
            value: formatDuration(overview.avg_exam_duration), 
            sub: "時間", 
            icon: Timer, 
            color: "text-cyan-500",
            bgColor: "bg-cyan-50"
          },
          { 
            title: "完成率", 
            value: `${overview.completion_rate.toFixed(1)}%`, 
            sub: "總體", 
            icon: CheckCircle, 
            color: "text-emerald-500",
            bgColor: "bg-emerald-50"
          },
          { 
            title: "補考率", 
            value: `${overview.retake_rate.toFixed(1)}%`, 
            sub: "總體", 
            icon: Repeat, 
            color: "text-rose-500",
            bgColor: "bg-rose-50"
          },
        ].map((kpi, idx) => (
          <div 
            key={idx + 4} 
            onClick={() => handleKPIClick(kpi.title)}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-gray-500">{kpi.title}</h3>
              <div className={`p-2 rounded-lg ${kpi.bgColor} group-hover:scale-110 transition-transform`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <p className="text-xs text-gray-500 mt-1">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* T1.6: 即時狀態區 */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* T1.6.1: 進行中的考試 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <RefreshCw className="mr-2 h-5 w-5 text-blue-500" />
              進行中的考試
            </h3>
            <span className="text-2xl font-bold text-blue-600">{activeExams.count}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {activeExams.exams.length === 0 ? (
              <p className="text-sm text-gray-500">目前沒有進行中的考試</p>
            ) : (
              activeExams.exams.map((exam) => (
                <div key={exam.plan_id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-sm text-gray-900">{exam.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    完成: {exam.completed_count}/{exam.target_count} 人
                    {exam.remaining_days !== null && (
                      <span className="ml-2">剩餘 {exam.remaining_days} 天</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* T1.6.2: 即將到期提醒 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-orange-500" />
              即將到期
            </h3>
            <span className="text-2xl font-bold text-orange-600">{expiringExams.count}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {expiringExams.exams.length === 0 ? (
              <p className="text-sm text-gray-500">3 天內沒有到期的考試</p>
            ) : (
              expiringExams.exams.map((exam) => (
                <div key={exam.plan_id} className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="font-medium text-sm text-gray-900">{exam.title}</div>
                  <div className="text-xs text-orange-600 mt-1 font-medium">
                    ⏰ 剩餘 {exam.remaining_days} 天
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    待考: {exam.pending_count} 人
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* T1.6.3: 待補考名單 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Repeat className="mr-2 h-5 w-5 text-red-500" />
              待補考
            </h3>
            <span className="text-2xl font-bold text-red-600">{retakeUsers.count}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {retakeUsers.users.length === 0 ? (
              <p className="text-sm text-gray-500">目前沒有待補考人員</p>
            ) : (
              retakeUsers.users.slice(0, 5).map((user) => (
                <div key={user.emp_id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="font-medium text-sm text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.dept_name}</div>
                  <div className="text-xs text-red-600 mt-1">
                    {user.plans.length} 個計畫需補考
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* T1.5: 趨勢圖表 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* T1.5.1: 時間趨勢折線圖 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">成績趨勢分析</h3>
            <select
              value={trendMonths}
              onChange={(e) => setTrendMonths(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value={6}>過去 6 個月</option>
              <option value={12}>過去 12 個月</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="avg_score" stroke="#3b82f6" name="平均分數" />
              <Line yAxisId="right" type="monotone" dataKey="pass_rate" stroke="#10b981" name="及格率 (%)" />
              <Line yAxisId="left" type="monotone" dataKey="count" stroke="#f59e0b" name="應考人次" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* T1.5.2: 部門對比長條圖 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">部門績效對比</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={deptComparison.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avg_score" fill="#3b82f6" name="平均分數" />
              <Bar dataKey="pass_rate" fill="#10b981" name="及格率 (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* T1.5.3: 計畫熱度圖表 */}
      {planPopularity && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">計畫熱度排行</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">應考人次排行</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={planPopularity.popularity_ranking.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="plan_title" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" name="應考人次" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">平均分數排行</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={planPopularity.score_ranking.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="plan_title" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="avg_score" fill="#ec4899" name="平均分數" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 分頁籤與時間篩選器 */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('department')}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-all",
                activeTab === 'department' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              各部門統計
            </button>
            <button
              onClick={() => setActiveTab('plan')}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-all",
                activeTab === 'plan' 
                  ? "bg-white text-gray-900 shadow-sm" 
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              計畫統計
            </button>
          </div>

          {/* 時間篩選器 */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={timeFilter.type}
              onChange={(e) => {
                const type = e.target.value as 'all' | 'year' | 'quarter' | 'month';
                setTimeFilter({ type, year: type !== 'all' ? new Date().getFullYear() : undefined });
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value="all">全部時間</option>
              <option value="year">年度</option>
              <option value="quarter">季度</option>
              <option value="month">月份</option>
            </select>
            
            {timeFilter.type === 'year' && (
              <input
                type="number"
                value={timeFilter.year || new Date().getFullYear()}
                onChange={(e) => setTimeFilter({ ...timeFilter, year: parseInt(e.target.value) })}
                className="text-sm border border-gray-300 rounded-md px-3 py-1 w-24"
                placeholder="年度"
              />
            )}
            
            {timeFilter.type === 'quarter' && (
              <>
                <input
                  type="number"
                  value={timeFilter.year || new Date().getFullYear()}
                  onChange={(e) => setTimeFilter({ ...timeFilter, year: parseInt(e.target.value) })}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1 w-24"
                  placeholder="年度"
                />
                <select
                  value={timeFilter.quarter || 1}
                  onChange={(e) => setTimeFilter({ ...timeFilter, quarter: parseInt(e.target.value) })}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1"
                >
                  <option value={1}>第1季</option>
                  <option value={2}>第2季</option>
                  <option value={3}>第3季</option>
                  <option value={4}>第4季</option>
                </select>
              </>
            )}
            
            {timeFilter.type === 'month' && (
              <>
                <input
                  type="number"
                  value={timeFilter.year || new Date().getFullYear()}
                  onChange={(e) => setTimeFilter({ ...timeFilter, year: parseInt(e.target.value) })}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1 w-24"
                  placeholder="年度"
                />
                <select
                  value={timeFilter.month || new Date().getMonth() + 1}
                  onChange={(e) => setTimeFilter({ ...timeFilter, month: parseInt(e.target.value) })}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>{m}月</option>
                  ))}
                </select>
              </>
            )}

            {activeTab === 'department' && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeAdvanced}
                  onChange={(e) => setIncludeAdvanced(e.target.checked)}
                  className="rounded"
                />
                進階分析
              </label>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">
              {activeTab === 'department' ? '部門績效表現' : '訓練計畫成效'}
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-500 w-12"></th>
                  {activeTab === 'department' && includeAdvanced && (
                    <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">排名</th>
                  )}
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-500">名稱</th>
                  {activeTab === 'plan' && <th className="px-6 py-4 text-left text-sm font-bold text-gray-500">日期</th>}
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">應考人次</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">平均分數</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">及格率</th>
                  {activeTab === 'department' && (
                    <>
                      <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">完成率</th>
                      {includeAdvanced && (
                        <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">成長率</th>
                      )}
                    </>
                  )}
                  {activeTab === 'plan' && (
                    <>
                      <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">完成率</th>
                      <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">成效評級</th>
                      <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">熱度評分</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(activeTab === 'department' ? deptStats : planStats).map((item: DepartmentStat | PlanStat, idx) => {
                  const itemId = activeTab === 'department' ? (item as DepartmentStat).dept_id : (item as PlanStat).plan_id;
                  const isExpanded = activeTab === 'department' 
                    ? expandedDept === itemId 
                    : expandedPlan === itemId;
                  
                  return (
                    <>
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          {itemId && (
                            <button
                              onClick={async () => {
                                if (activeTab === 'department') {
                                  if (expandedDept === itemId) {
                                    setExpandedDept(null);
                                  } else {
                                    setExpandedDept(itemId);
                                    // 載入部門詳情
                                    if (!deptDetails[itemId]) {
                                      try {
                                        const token = localStorage.getItem('token');
                                        const baseURL = `http://${window.location.hostname}:8000/api`;
                                        const res = await fetch(
                                          `${baseURL}/admin/reports/department/${itemId}/details?page=1&page_size=10`,
                                          { headers: { 'Authorization': `Bearer ${token}` } }
                                        );
                                        if (res.ok) {
                                          const data = await res.json();
                                          setDeptDetails({ ...deptDetails, [itemId]: data });
                                        }
                                      } catch (error) {
                                        console.error('Failed to fetch department details', error);
                                      }
                                    }
                                  }
                                } else {
                                  if (expandedPlan === itemId) {
                                    setExpandedPlan(null);
                                  } else {
                                    setExpandedPlan(itemId);
                                    // 載入計畫詳情
                                    if (!planDetails[itemId]) {
                                      try {
                                        const token = localStorage.getItem('token');
                                        const baseURL = `http://${window.location.hostname}:8000/api`;
                                        const res = await fetch(
                                          `${baseURL}/admin/reports/plan/${itemId}/details?page=1&page_size=10`,
                                          { headers: { 'Authorization': `Bearer ${token}` } }
                                        );
                                        if (res.ok) {
                                          const data = await res.json();
                                          setPlanDetails({ ...planDetails, [itemId]: data });
                                        }
                                      } catch (error) {
                                        console.error('Failed to fetch plan details', error);
                                      }
                                    }
                                  }
                                }
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                        {activeTab === 'department' && includeAdvanced && (
                          <td className="px-6 py-4 text-right">
                            {(item as DepartmentStat).rank ? (
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                                {(item as DepartmentStat).rank}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        )}
                        <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                        {activeTab === 'plan' && 'date' in item && (
                          <td className="px-6 py-4 text-gray-500">
                            {item.date ? new Date(item.date).toLocaleDateString() : '-'}
                          </td>
                        )}
                        <td className="px-6 py-4 text-right text-gray-700">{item.count}</td>
                        <td className={clsx(
                          "px-6 py-4 text-right font-bold",
                          item.avg_score >= 60 ? "text-green-600" : "text-red-500"
                        )}>
                          {item.avg_score}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">{item.pass_rate}%</td>
                        {activeTab === 'department' && (
                          <>
                            <td className="px-6 py-4 text-right text-gray-700">
                              {(item as DepartmentStat).completion_rate?.toFixed(1) || '-'}%
                            </td>
                            {includeAdvanced && (
                              <td className="px-6 py-4 text-right">
                                {(item as DepartmentStat).growth_rate !== null && (item as DepartmentStat).growth_rate !== undefined ? (
                                  <span className={clsx(
                                    "flex items-center justify-end gap-1",
                                    (item as DepartmentStat).growth_rate! >= 0 ? "text-green-600" : "text-red-600"
                                  )}>
                                    {(item as DepartmentStat).growth_rate! >= 0 ? (
                                      <TrendingUp className="h-4 w-4" />
                                    ) : (
                                      <TrendingDown className="h-4 w-4" />
                                    )}
                                    {Math.abs((item as DepartmentStat).growth_rate!).toFixed(1)}%
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                            )}
                          </>
                        )}
                        {activeTab === 'plan' && (
                          <>
                            <td className="px-6 py-4 text-right text-gray-700">
                              {(item as PlanStat).completion_rate?.toFixed(1) || '-'}%
                            </td>
                            <td className="px-6 py-4 text-right">
                              {(item as PlanStat).effectiveness_grade ? (
                                <span className={clsx(
                                  "inline-flex items-center px-2 py-1 rounded-full text-xs font-bold",
                                  (item as PlanStat).effectiveness_grade === 'A' ? "bg-green-100 text-green-700" :
                                  (item as PlanStat).effectiveness_grade === 'B' ? "bg-blue-100 text-blue-700" :
                                  (item as PlanStat).effectiveness_grade === 'C' ? "bg-yellow-100 text-yellow-700" :
                                  "bg-red-100 text-red-700"
                                )}>
                                  {(item as PlanStat).effectiveness_grade}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-6 py-4 text-right text-gray-700">
                              {(item as PlanStat).popularity_score?.toFixed(1) || '-'}
                            </td>
                          </>
                        )}
                      </tr>
                      {/* 展開詳情 */}
                      {isExpanded && itemId && (
                        <tr>
                          <td colSpan={activeTab === 'department' ? (includeAdvanced ? 8 : 6) : 8} className="px-6 py-4 bg-gray-50">
                            {activeTab === 'department' ? (
                              <div className="space-y-4">
                                {/* 部門詳情 */}
                                {deptDetails[itemId] && (
                                  <div>
                                    <h4 className="font-bold text-gray-900 mb-2">成員成績列表</h4>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            <th className="px-4 py-2 text-left">姓名</th>
                                            <th className="px-4 py-2 text-left">計畫</th>
                                            <th className="px-4 py-2 text-right">分數</th>
                                            <th className="px-4 py-2 text-right">是否通過</th>
                                            <th className="px-4 py-2 text-right">提交時間</th>
                                            <th className="px-4 py-2 text-center">操作</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {deptDetails[itemId].records.map((record: any, rIdx: number) => (
                                            <tr key={rIdx} className="border-b">
                                              <td className="px-4 py-2">{record.name}</td>
                                              <td className="px-4 py-2">{record.plan_title}</td>
                                              <td className="px-4 py-2 text-right">{record.total_score}</td>
                                              <td className="px-4 py-2 text-right">
                                                {record.is_passed ? (
                                                  <span className="text-green-600">✓</span>
                                                ) : (
                                                  <span className="text-red-600">✗</span>
                                                )}
                                              </td>
                                              <td className="px-4 py-2 text-right text-gray-500">
                                                {record.submit_time ? new Date(record.submit_time).toLocaleString() : '-'}
                                              </td>
                                              <td className="px-4 py-2 text-center">
                                                {record.emp_id && (
                                                  <Link
                                                    to={`/reports/personal?emp_id=${record.emp_id}`}
                                                    className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                                  >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    查看個人成績
                                                  </Link>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                
                                {/* 成績分布圖表 */}
                                {(item as DepartmentStat).score_distribution && (
                                  <div>
                                    <h4 className="font-bold text-gray-900 mb-2">成績分布</h4>
                                    <ResponsiveContainer width="100%" height={200}>
                                      <BarChart data={Object.entries((item as DepartmentStat).score_distribution!).map(([range, count]) => ({
                                        range,
                                        count
                                      }))}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="range" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#3b82f6" />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                                
                                {/* 個人排名 Top 10 */}
                                {(item as DepartmentStat).top_users && (item as DepartmentStat).top_users!.length > 0 && (
                                  <div>
                                    <h4 className="font-bold text-gray-900 mb-2">個人排名 Top 10</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                      {(item as DepartmentStat).top_users!.map((user, uIdx) => (
                                        <div key={uIdx} className="flex items-center justify-between p-2 bg-white rounded border">
                                          <div>
                                            <div className="font-medium text-sm">{user.name}</div>
                                            <div className="text-xs text-gray-500">{user.emp_id}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="font-bold text-blue-600">{user.avg_score}</div>
                                            <div className="text-xs text-gray-500">{user.count} 次</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {/* 計畫詳情 */}
                                {planDetails[itemId] && (
                                  <div>
                                    <h4 className="font-bold text-gray-900 mb-2">考生成績列表</h4>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            <th className="px-4 py-2 text-left">姓名</th>
                                            <th className="px-4 py-2 text-left">部門</th>
                                            <th className="px-4 py-2 text-right">分數</th>
                                            <th className="px-4 py-2 text-right">是否通過</th>
                                            <th className="px-4 py-2 text-right">提交時間</th>
                                            <th className="px-4 py-2 text-center">操作</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {planDetails[itemId].records.map((record: any, rIdx: number) => (
                                            <tr key={rIdx} className="border-b">
                                              <td className="px-4 py-2">{record.name}</td>
                                              <td className="px-4 py-2">{record.dept_name}</td>
                                              <td className="px-4 py-2 text-right">{record.total_score}</td>
                                              <td className="px-4 py-2 text-right">
                                                {record.is_passed ? (
                                                  <span className="text-green-600">✓</span>
                                                ) : (
                                                  <span className="text-red-600">✗</span>
                                                )}
                                              </td>
                                              <td className="px-4 py-2 text-right text-gray-500">
                                                {record.submit_time ? new Date(record.submit_time).toLocaleString() : '-'}
                                              </td>
                                              <td className="px-4 py-2 text-center">
                                                {record.emp_id && (
                                                  <Link
                                                    to={`/reports/personal?emp_id=${record.emp_id}`}
                                                    className="inline-flex items-center px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                                  >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    查看個人成績
                                                  </Link>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* KPI 詳細資訊 Modal */}
      {showKPIModal && selectedKPI && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowKPIModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">{selectedKPI} 詳細資訊</h3>
              <button
                onClick={() => setShowKPIModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              {(() => {
                const details = getKPIDetails(selectedKPI);
                return (
                  <>
                    <p className="text-gray-600 mb-4">{details.description}</p>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-500 mb-1">當前數值</div>
                      <div className="text-3xl font-bold text-gray-900">
                        {details.value} {details.unit}
                      </div>
                    </div>
                    {selectedKPI === "總考試場次" && (
                      <div className="mt-4 text-sm text-gray-600">
                        <p className="font-medium mb-2">相關統計：</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>本月新增：{overview.monthly_new_exams} 場次</li>
                          <li>進行中：{activeExams.count} 場次</li>
                          <li>即將到期：{expiringExams.count} 場次</li>
                        </ul>
                      </div>
                    )}
                    {selectedKPI === "總應考人次" && (
                      <div className="mt-4 text-sm text-gray-600">
                        <p className="font-medium mb-2">相關統計：</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>本月應考：{overview.monthly_records} 人次</li>
                          <li>平均分數：{overview.average_score.toFixed(1)} 分</li>
                          <li>及格率：{overview.pass_rate.toFixed(1)}%</li>
                        </ul>
                      </div>
                    )}
                    {selectedKPI === "待考試" && (
                      <div className="mt-4 text-sm text-gray-600">
                        <p className="font-medium mb-2">相關統計：</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>完成率：{overview.completion_rate.toFixed(1)}%</li>
                          <li>進行中的考試：{activeExams.count} 場</li>
                          <li>待補考人數：{retakeUsers.count} 人</li>
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => setShowKPIModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
