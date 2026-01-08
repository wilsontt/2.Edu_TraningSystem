
import { useState, useEffect } from 'react';
import { Download, Users, FileText, CheckCircle, TrendingUp } from "lucide-react";
import clsx from 'clsx';
import { format } from "date-fns";

// 定義型別
interface OverviewStats {
  total_exams: number;
  total_records: number;
  average_score: number;
  pass_rate: number;
}

interface DepartmentStat {
  name: string;
  count: number;
  avg_score: number;
  pass_rate: number;
}

interface PlanStat {
  name: string;
  date: string;
  count: number;
  avg_score: number;
  pass_rate: number;
}

export default function ReportDashboard() {
  const [overview, setOverview] = useState<OverviewStats>({
    total_exams: 0,
    total_records: 0,
    average_score: 0,
    pass_rate: 0
  });
  const [deptStats, setDeptStats] = useState<DepartmentStat[]>([]);
  const [planStats, setPlanStats] = useState<PlanStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'department' | 'plan'>('department');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [overviewRes, deptRes, planRes] = await Promise.all([
        fetch('http://localhost:8000/api/admin/reports/overview', { headers }),
        fetch('http://localhost:8000/api/admin/reports/department', { headers }),
        fetch('http://localhost:8000/api/admin/reports/plan', { headers })
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (deptRes.ok) setDeptStats(await deptRes.json());
      if (planRes.ok) setPlanStats(await planRes.json());

    } catch (error) {
      console.error("Failed to fetch report data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:8000/api/admin/reports/export/pdf', {
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

  if (loading) {
     return <div className="p-8 flex justify-center text-gray-500">載入中...</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">統計報表</h2>
        <button 
          onClick={handleExportPDF} 
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm"
        >
          <Download className="mr-2 h-4 w-4" />
          匯出 PDF
        </button>
      </div>

      {/* 關鍵績效指標 (KPI) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "總考試場次", value: overview.total_exams, sub: "所有計畫", icon: FileText, color: "text-blue-500" },
          { title: "總應考人次", value: overview.total_records, sub: "累積人次", icon: Users, color: "text-green-500" },
          { title: "平均分數", value: overview.average_score, sub: "分", icon: TrendingUp, color: "text-yellow-500" },
          { title: "及格率", value: `${overview.pass_rate}%`, sub: "總體", icon: CheckCircle, color: "text-red-500" }
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-gray-500">{kpi.title}</h3>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{kpi.value}</div>
              <p className="text-xs text-gray-500">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 分頁籤 */}
      <div className="space-y-4">
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
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-500">名稱</th>
                  {activeTab === 'plan' && <th className="px-6 py-4 text-left text-sm font-bold text-gray-500">日期</th>}
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">應考人次</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">平均分數</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-500">及格率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(activeTab === 'department' ? deptStats : planStats).map((item: DepartmentStat | PlanStat, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
