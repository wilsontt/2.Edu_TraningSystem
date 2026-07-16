import { X, Printer } from 'lucide-react';
import clsx from 'clsx';
import type { ScoreDetail } from './types';
import { buildBatchPrintHtml, printHtmlInIframe } from './scoreCardPrintHtml';
import { parseBackendDateTime } from '../../utils/date';

interface ScoreCardPreviewProps {
  detail: ScoreDetail;
  isOpen: boolean;
  onClose: () => void;
  /** 為 false 時不顯示簽名欄（螢幕預覽與列印 HTML） */
  includeEmployeeSignature?: boolean;
  /**
   * T13（規格約 211–214 行）：單次成績瀏覽器列印不得附「考試歷程」大表 → 預設 false；
   * 僅在需將歷程表併入列印 HTML 時顯式傳 true。
   */
  printIncludeExamHistory?: boolean;
}

// 成績單內容組件（可重用）
function ScoreCardContent({
  detail,
  includeEmployeeSignature,
}: {
  detail: ScoreDetail;
  includeEmployeeSignature: boolean;
}) {
  return (
    <>
      {/* 標題 */}
      <div className="text-center mt-0 pt-0 mb-1">
        <h1 className="text-3xl font-bold text-gray-900 mb-0">教育訓練測驗成績單</h1>
        <div className="text-sm text-gray-600">Training Examination Score Report</div>
      </div>

      {/* 基本資訊 + 成績資訊 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-1">
          {/* 基本資訊 (左側 2 欄) */}
          <div className="sm:col-span-2 border-2 border-gray-800 mb-2 p-2">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <div>
                <div className="text-sm text-gray-600 mb-0">考生姓名 / Name</div>
                <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
                  {detail.basic_info.name}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-0">員工編號 / Employee ID</div>
                <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
                  {detail.basic_info.emp_id}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-0">部門 / Department</div>
                <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
                  {detail.basic_info.dept_name}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-0">測驗日期 / Date</div>
                <div className="font-bold text-lg border-b-2 border-gray-800 pb-1">
                  {detail.basic_info.submit_time
                    ? parseBackendDateTime(detail.basic_info.submit_time)?.toLocaleDateString('zh-TW') || '-'
                    : '-'}
                </div>
              </div>
            </div>
          </div>
          
          {/* 成績資訊 (右側 1 欄) - 僅顯示總分 */}
          <div className="sm:col-span-1 mb-2 w-full min-w-0">
            <div className="h-full flex flex-col">
              <div className="flex-1 border-2 border-gray-800 px-6 py-6 sm:px-6 flex flex-col justify-center items-center min-h-[7.5rem]">
                <div className="text-base text-gray-600 mb-2 text-center">總分 / Total Score</div>
                <div
                  className={clsx(
                    'font-bold score-handwriting leading-none whitespace-nowrap px-2',
                    detail.basic_info.is_passed ? 'text-blue-600' : 'text-red-600',
                    'max-sm:rotate-0 sm:-rotate-3',
                    String(detail.basic_info.total_score).length >= 3 ? 'text-5xl' : 'text-6xl sm:text-7xl',
                  )}
                  style={{
                    textShadow: '2px 2px 0px rgba(0,0,0,0.1)',
                    fontFamily: "Caveat, 'Comic Sans MS', 'Patrick Hand', cursive",
                  }}
                >
                  {detail.basic_info.total_score}
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* 訓練計畫資訊 + Watermark Result */}
      <div className="mb-5 sm:relative">
        <div className="w-full sm:w-2/3">
           <div className="text-sm text-gray-600 mb-1">訓練計畫 / Training Plan</div>
           <div className="font-bold text-xl border-b-2 border-gray-800 pb-2">
             {detail.basic_info.plan_title}
           </div>
        </div>

        {/* 行動版：浮水印獨立於下方不疊加；桌面版：維持蓋章浮印 */}
        <div
          className={clsx(
            'pointer-events-none flex justify-center mt-4',
            'sm:absolute sm:right-8 sm:bottom-[-10px] sm:mt-0 sm:rotate-12',
          )}
        >
           <div className={clsx(
              'border-4 border-double px-6 sm:px-8 py-2 rounded-lg flex flex-col items-center justify-center bg-white/80 sm:bg-white/10 sm:backdrop-blur-sm',
              detail.basic_info.is_passed
                  ? 'border-green-600 text-green-600'
                  : 'border-red-600 text-red-600'
           )} style={{ minWidth: 'min(180px, 100%)' }}>
              <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-0">Result</div>
              <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{detail.basic_info.is_passed ? '通過' : '未通過'}</span>
                  <span className="text-3xl font-black tracking-widest font-sans">{detail.basic_info.is_passed ? 'PASS' : 'FAIL'}</span>
              </div>
           </div>
        </div>
      </div>

      {/* 簽名欄 (預覽時隱藏，列印時移至第一頁底部) */}
      {includeEmployeeSignature && (
        <div className="mt-4 grid grid-cols-2 gap-8 print:hidden">
          <div>
            <div className="text-sm text-gray-600 mb-1">考生簽名 / Examinee Signature</div>
            <div className="border-b-2 border-gray-800 h-16"></div>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">日期 / Date</div>
            <div className="border-b-2 border-gray-800 h-16"></div>
          </div>
        </div>
      )}

      {/* 答題詳情表格 (預覽時隱藏，列印時使用新版詳細列表) */}
      <div className="mb-6 print:hidden">
        <div className="text-sm font-bold text-gray-700 mb-2">答題詳情 / Answer Details</div>
        <table className="w-full border-2 border-gray-800">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold w-12">題號</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold">題目</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold w-20">考生答案</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold w-20">正確答案</th>
              <th className="border border-gray-800 px-2 py-2 text-sm font-bold w-18">得分</th>
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
    </>
  );
}

export default function ScoreCardPreview({
  detail,
  isOpen,
  onClose,
  includeEmployeeSignature = true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  printIncludeExamHistory: _printIncludeExamHistory = false,
}: ScoreCardPreviewProps) {

  if (!isOpen) return null;

  const handlePrint = () => {
    const htmlContent = buildBatchPrintHtml(
      [{ has_exam: true, attendance_status: '', detail }],
      includeEmployeeSignature,
      { answerDetailLayout: 'preview_table' },
    );
    printHtmlInIframe(htmlContent);
  };

  return (
    <>
      {/* 模態框（列印時隱藏） */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:hidden" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col print:hidden" onClick={(e) => e.stopPropagation()}>
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

          {/* 成績單內容（螢幕預覽用）；內層捲動避免 overflow-y-auto 裁切旋轉分數 */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <div className="border-2 border-gray-800 p-4 sm:p-8 score-card-preview-content">
              <ScoreCardContent detail={detail} includeEmployeeSignature={includeEmployeeSignature} />
            </div>
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
    </>
  );
}
