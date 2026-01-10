import { X, Printer } from 'lucide-react';
import clsx from 'clsx';
import type { ScoreDetail } from './ScoreDetailModal';

interface ScoreCardPreviewProps {
  detail: ScoreDetail;
  isOpen: boolean;
  onClose: () => void;
}

export default function ScoreCardPreview({ detail, isOpen, onClose }: ScoreCardPreviewProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">成績單預覽</h3>
          <div className="flex items-center gap-2">
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

        {/* 成績單內容（符合官方樣張格式） */}
        <div className="p-8 print:p-4">
          <div className="border-2 border-gray-800 p-8 print:p-6">
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
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
