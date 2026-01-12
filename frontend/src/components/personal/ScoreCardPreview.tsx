import { X, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import type { ScoreDetail } from './ScoreDetailModal';

interface ScoreCardPreviewProps {
  detail: ScoreDetail;
  isOpen: boolean;
  onClose: () => void;
}

interface PersonalAnalysis {
  emp_id: string;
  progress: {
    completed: number;
    total: number;
    progress_rate: number;
  };
  strong_areas: Array<{
    category_id: number;
    category_name: string;
    avg_score: number;
    count: number;
  }>;
  weak_areas: Array<{
    category_id: number;
    category_name: string;
    avg_score: number;
    count: number;
  }>;
  category_analysis: Array<{
    category_id: number;
    category_name: string;
    avg_score: number;
    count: number;
  }>;
  trend_data: Array<{
    month: string;
    year: number;
    month_num: number;
    avg_score: number;
    count: number;
  }>;
}

// 成績單內容組件（可重用）
function ScoreCardContent({ detail, includeHistory, analysis }: { 
  detail: ScoreDetail; 
  includeHistory?: boolean;
  analysis?: PersonalAnalysis | null;
}) {
  return (
    <>
      {/* 標題 */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">教育訓練測驗成績單</h1>
        <div className="text-sm text-gray-600">Training Examination Score Report</div>
      </div>

      {/* 基本資訊 */}
      <div className="mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600 mb-1">考生姓名 / Name</div>
            <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
              {detail.basic_info.name}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">員工編號 / Employee ID</div>
            <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
              {detail.basic_info.emp_id}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">部門 / Department</div>
            <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
              {detail.basic_info.dept_name}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">測驗日期 / Date</div>
            <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
              {detail.basic_info.submit_time
                ? new Date(detail.basic_info.submit_time).toLocaleDateString('zh-TW')
                : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 訓練計畫資訊 */}
      <div className="mb-6">
        <div className="text-sm text-gray-600 mb-1">訓練計畫 / Training Plan</div>
        <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
          {detail.basic_info.plan_title}
        </div>
      </div>

      {/* 成績資訊 */}
      <div className="mb-8">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center border-2 border-gray-800 p-4">
            <div className="text-sm text-gray-600 mb-2">總分 / Total Score</div>
            <div className="text-4xl font-bold text-red-600 font-['Caveat'] transform rotate-[-2deg]" style={{ 
              textShadow: '1px 1px 2px rgba(220, 38, 38, 0.2)',
              letterSpacing: '0.05em'
            }}>
              {detail.basic_info.total_score}
            </div>
          </div>
          <div className="text-center border-2 border-gray-800 p-4">
            <div className="text-sm text-gray-600 mb-2">及格分數 / Passing Score</div>
            <div className="text-3xl font-bold text-gray-900">
              {detail.basic_info.passing_score}
            </div>
          </div>
          <div className="text-center border-2 border-gray-800 p-4">
            <div className="text-sm text-gray-600 mb-2">結果 / Result</div>
            <div className={detail.basic_info.is_passed ? "text-2xl font-bold text-green-600" : "text-2xl font-bold text-red-600"}>
              {detail.basic_info.is_passed ? '通過 / PASS' : '未通過 / FAIL'}
            </div>
          </div>
        </div>
      </div>

      {/* 答題詳情表格 */}
      <div className="mb-6">
        <div className="text-sm font-bold text-gray-700 mb-2">答題詳情 / Answer Details</div>
        <table className="w-full border-2 border-gray-800">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold">題號</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold">題目</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold">您的答案</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold">正確答案</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold">得分</th>
            </tr>
          </thead>
          <tbody>
            {detail.question_details.map((q) => (
              <tr key={q.question_id} className={q.is_correct ? '' : 'bg-red-50'}>
                <td className="border border-gray-800 px-2 py-2 text-center text-sm">
                  {q.question_number}
                </td>
                <td className="border border-gray-800 px-2 py-2 text-sm">
                  {q.content}
                </td>
                <td className={clsx(
                  "border border-gray-800 px-2 py-2 text-sm text-center font-medium",
                  q.is_correct ? "text-green-700" : "text-red-700"
                )}>
                  {q.user_answer || '未作答'}
                </td>
                <td className="border border-gray-800 px-2 py-2 text-sm text-center font-medium text-green-700">
                  {q.correct_answer}
                </td>
                <td className={clsx(
                  "border border-gray-800 px-2 py-2 text-sm text-center font-bold",
                  q.is_correct ? "text-green-700" : "text-red-700"
                )}>
                  {q.earned_points} / {q.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 簽名欄 */}
      <div className="mt-8 grid grid-cols-2 gap-8">
        <div>
          <div className="text-sm text-gray-600 mb-1">考生簽名 / Examinee Signature</div>
          <div className="border-b-2 border-gray-800 h-16"></div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">日期 / Date</div>
          <div className="border-b-2 border-gray-800 h-16"></div>
        </div>
      </div>

      {/* 個人成績歷史（如果選擇要列印） */}
      {includeHistory && analysis && (
        <div className="mt-12 page-break-before">
          <div className="border-t-2 border-gray-800 pt-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">個人成績歷史 / Personal Score History</h2>
            
            {/* 學習進度 */}
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">學習進度 / Learning Progress</h3>
              <div className="border-2 border-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">完成進度 / Completion</span>
                  <span className="text-lg font-bold text-gray-900">
                    {analysis.progress.completed} / {analysis.progress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 border border-gray-800">
                  <div
                    className="bg-blue-600 h-4 rounded-full"
                    style={{ width: `${analysis.progress.progress_rate}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  完成率 / Progress Rate: {analysis.progress.progress_rate.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* 擅長領域 */}
            {analysis.strong_areas.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">擅長領域 / Strong Areas</h3>
                <table className="w-full border-2 border-gray-800">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">分類 / Category</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">平均分數 / Avg Score</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">考試次數 / Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.strong_areas.map((area) => (
                      <tr key={area.category_id} className="bg-green-50">
                        <td className="border border-gray-800 px-2 py-2 text-sm">{area.category_name}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center font-bold text-green-700">{area.avg_score}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center">{area.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 需要加強的領域 */}
            {analysis.weak_areas.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">需要加強的領域 / Weak Areas</h3>
                <table className="w-full border-2 border-gray-800">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">分類 / Category</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">平均分數 / Avg Score</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">考試次數 / Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.weak_areas.map((area) => (
                      <tr key={area.category_id} className="bg-red-50">
                        <td className="border border-gray-800 px-2 py-2 text-sm">{area.category_name}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center font-bold text-red-700">{area.avg_score}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center">{area.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 各分類成績分析 */}
            {analysis.category_analysis.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">各分類成績分析 / Category Analysis</h3>
                <table className="w-full border-2 border-gray-800">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">分類 / Category</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">平均分數 / Avg Score</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">考試次數 / Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.category_analysis.map((area) => (
                      <tr key={area.category_id}>
                        <td className="border border-gray-800 px-2 py-2 text-sm">{area.category_name}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center font-bold">{area.avg_score}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center">{area.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 成績趨勢 */}
            {analysis.trend_data.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">過去 6 個月成績趨勢 / Score Trend (Last 6 Months)</h3>
                <table className="w-full border-2 border-gray-800">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">月份 / Month</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">平均分數 / Avg Score</th>
                      <th className="border border-gray-800 px-2 py-2 text-sm font-bold">考試次數 / Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.trend_data.map((trend, idx) => (
                      <tr key={idx}>
                        <td className="border border-gray-800 px-2 py-2 text-sm">{trend.month}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center font-bold">{trend.avg_score}</td>
                        <td className="border border-gray-800 px-2 py-2 text-sm text-center">{trend.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 頁碼（頁尾） */}
      <div className="mt-8 text-center text-sm text-gray-600 print-page-number">
        第 <span className="page-number"></span> 頁 / Page <span className="page-number"></span>
      </div>
    </>
  );
}

export default function ScoreCardPreview({ detail, isOpen, onClose }: ScoreCardPreviewProps) {
  const [includeHistory, setIncludeHistory] = useState(false);
  const [analysis, setAnalysis] = useState<PersonalAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    if (includeHistory && !analysis && isOpen) {
      fetchAnalysis();
    }
  }, [includeHistory, isOpen]);

  const fetchAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      const token = localStorage.getItem('token');
      const baseURL = `http://${window.location.hostname}:8000/api`;
      const url = `${baseURL}/exam/personal/analysis?emp_id=${detail.basic_info.emp_id}`;
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
      setLoadingAnalysis(false);
    }
  };

  if (!isOpen) return null;

  const handlePrint = () => {
    // 在列印前更新頁碼
    const updatePageNumbers = () => {
      const pageNumbers = document.querySelectorAll('.print-page-number .page-number');
      pageNumbers.forEach((el) => {
        // 頁碼會在列印時由瀏覽器自動處理，這裡先設置為空
        // 實際頁碼會由 CSS counter 處理
      });
    };
    
    // 使用 setTimeout 確保 DOM 更新完成
    setTimeout(() => {
      updatePageNumbers();
      window.print();
    }, 100);
  };

  return (
    <>
      {/* 模態框（列印時隱藏） */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:hidden" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">成績單預覽</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span>包含個人成績歷史</span>
              </label>
              <button
                onClick={handlePrint}
                className="flex items-center px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Printer className="h-4 w-4 mr-1" />
                列印
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 成績單內容（螢幕預覽用） */}
          <div className="p-8">
            <div className="border-2 border-gray-800 p-8">
              <ScoreCardContent detail={detail} includeHistory={includeHistory} analysis={analysis} />
            </div>
            {includeHistory && loadingAnalysis && (
              <div className="mt-4 text-center text-gray-500 text-sm">載入個人成績歷史中...</div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
            >
              關閉
            </button>
          </div>
        </div>
      </div>

      {/* 列印專用版本（只在列印時顯示，從頁面頂部開始） */}
      <div className="hidden print:block print-content">
        <div className="p-4">
          <div className="border-2 border-gray-800 p-6">
            <ScoreCardContent detail={detail} includeHistory={includeHistory} analysis={analysis} />
          </div>
        </div>
      </div>
    </>
  );
}
