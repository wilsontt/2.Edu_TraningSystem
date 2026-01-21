import { X, Printer } from 'lucide-react';
import clsx from 'clsx';
import type { ScoreDetail } from './types';

interface ScoreCardPreviewProps {
  detail: ScoreDetail;
  isOpen: boolean;
  onClose: () => void;
}

// SVG Icons for Print HTML
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const ICON_X = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-600"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_CHECK_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
const ICON_X_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-600"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

// 成績單內容組件（可重用）
function ScoreCardContent({ detail }: { 
  detail: ScoreDetail; 
}) {
  return (
    <>
      {/* 標題 */}
      <div className="text-center mt-0 pt-0 mb-1">
        <h1 className="text-3xl font-bold text-gray-900 mb-0">教育訓練測驗成績單</h1>
        <div className="text-sm text-gray-600">Training Examination Score Report</div>
      </div>

      {/* 基本資訊 + 成績資訊 */}
      <div className="grid grid-cols-3 gap-6 mb-1">
          {/* 基本資訊 (左側 2 欄) */}
          <div className="col-span-2 border-2 border-gray-800 mb-2 p-2">
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
                    ? new Date(detail.basic_info.submit_time).toLocaleDateString('zh-TW')
                    : '-'}
                </div>
              </div>
            </div>
          </div>
          
          {/* 成績資訊 (右側 1 欄) - 僅顯示總分 */}
          <div className="col-span-1 mb-2">
            <div className="h-full flex flex-col">
              <div className="flex-1 border-2 border-gray-800 p-4 flex flex-col justify-center items-center">
                <div className="text-base text-gray-600 mb-2">總分 / Total Score</div>
                <div 
                  className="text-7xl font-bold text-red-600 transform -rotate-3" 
                  style={{ 
                    textShadow: '2px 2px 0px rgba(0,0,0,0.1)',
                    fontFamily: "Caveat, 'Comic Sans MS', 'Patrick Hand', cursive"
                  }}
                >
                  {detail.basic_info.total_score}
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* 訓練計畫資訊 + Watermark Result */}
      <div className="mb-5 relative">
        <div className="flex items-end justify-between">
          <div className="w-2/3">
             <div className="text-sm text-gray-600 mb-1">訓練計畫 / Training Plan</div>
             <div className="font-bold text-xl border-b-2 border-gray-800 pb-2">
               {detail.basic_info.plan_title}
             </div>
          </div>
          
          {/* Watermark Result Stamped Area 考試結果以浮印置底方式呈現 -rotate-12 (預設值：逆時針 12 度旋轉) */}
          <div className="absolute right-0 bottom-[-10px] transform rotate-12 pointer-events-none">
             <div className={clsx(
                "border-4 border-double px-8 py-2 rounded-lg flex flex-col items-center justify-center bg-white/10 backdrop-blur-sm",
                detail.basic_info.is_passed 
                    ? "border-green-600 text-green-600" 
                    : "border-red-600 text-red-600"
             )} style={{ minWidth: '180px' }}>
                <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-0">Result</div>
                <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{detail.basic_info.is_passed ? '通過' : '未通過'}</span>
                    <span className="text-3xl font-black tracking-widest font-sans">{detail.basic_info.is_passed ? 'PASS' : 'FAIL'}</span>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* 簽名欄 (預覽時隱藏，列印時移至第一頁底部) */}
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

export default function ScoreCardPreview({ detail, isOpen, onClose }: ScoreCardPreviewProps) {

  if (!isOpen) return null;

  const handlePrint = () => {
    // 1. 獲取內容
    const contentElement = document.querySelector('.score-card-preview-content');
    if (!contentElement) {
      console.error('無法找到成績單內容');
      return;
    }

    // 2. 建立隱藏 iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    // 必須顯示才能列印，但移出視窗外或透明
    iframe.style.visibility = 'hidden'; 
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
        document.body.removeChild(iframe);
        return;
    }

    // 3. 收集當前頁面的所有樣式 (Tailwind, Fonts 等)
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(style => style.outerHTML)
        .join('');

    // 解析選項 helper
    const parseOptions = (optionsStr: string | null): Record<string, string> => {
        if (!optionsStr) return {};
        try { return JSON.parse(optionsStr); } catch { return {}; }
    };

    // 生成題目詳情 HTML
    const detailsHtml = detail.question_details.map((q) => {
        const options = parseOptions(q.options);
        const borderColor = q.is_correct ? 'border-green-500' : 'border-red-500';
        const bgColor = q.is_correct ? 'bg-green-50' : 'bg-red-50';
        
        // 考生的答案 (處理多選 A,B)
        const userAnswers = (q.user_answer || '').split(',').map(s => s.trim()).filter(Boolean);

        // 選項列表 HTML
        const optionsListHtml = Object.entries(options).map(([key, value]) => {
            const isSelected = userAnswers.includes(key);
            
            const isCorrectOption = (q.correct_answer || '').includes(key);
            let iconHtml = '';
            
            if (isSelected) {
                iconHtml = isCorrectOption ? ICON_CHECK : ICON_X;
            }

            return `
                <div class="flex items-start gap-2 mb-1">
                    <div class="w-6 flex justify-center pt-1">${iconHtml}</div>
                    <div class="font-medium text-gray-700">${key}. ${value}</div>
                </div>
            `;
        }).join('');

        // 底部對照 HTML
        // 考生的答案顯示
        const userAnswerDisplay = userAnswers.map(ans => {
            const text = options[ans] || '';
            return `${ans} ${text ? `(${text})` : ''}`;
        }).join(', ') || '未作答';

        // 正確答案顯示
        const correctAnswers = (q.correct_answer || '').split(',').map(s => s.trim());
        const correctAnswerDisplay = correctAnswers.map(ans => {
            const text = options[ans] || '';
            return `${ans} ${text ? `(${text})` : ''}`;
        }).join(', ');

        return `
            <div class="border-2 rounded-lg p-4 mb-4 break-inside-avoid ${borderColor} ${bgColor}">
                <div class="flex justify-between items-start mb-2 border-b border-gray-200 pb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-gray-700">第 ${q.question_number} 題</span>
                        <span class="text-xs px-2 py-1 rounded bg-white border border-gray-200 text-gray-600">
                            ${q.question_type}
                        </span>
                        ${q.is_correct ? ICON_CHECK_CIRCLE : ICON_X_CIRCLE}
                    </div>
                    <div class="font-bold ${q.is_correct ? 'text-green-600' : 'text-red-600'}">
                        ${q.earned_points} / ${q.points}
                    </div>
                </div>
                
                <div class="mb-4">
                    <div class="font-bold text-gray-900 mb-2 text-lg">${q.content}</div>
                    <div class="ml-2">
                        ${optionsListHtml}
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-300/50 text-sm">
                    <div>
                        <div class="text-gray-500 mb-1">您的答案</div>
                        <div class="font-medium ${q.is_correct ? 'text-green-700' : 'text-red-700'}">
                            ${userAnswerDisplay}
                        </div>
                    </div>
                    <div>
                        <div class="text-gray-500 mb-1">正確答案</div>
                        <div class="font-medium text-green-700">
                            ${correctAnswerDisplay}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 生成考試歷程 HTML
    let historyHtml = '';
    if (detail.history && detail.history.length > 0) {
        const historyRows = detail.history.map((h, idx) => `
            <tr class="border-b border-gray-200">
                <td class="py-2 px-4 text-center">${idx + 1}</td>
                <td class="py-2 px-4 text-center">${h.submit_time ? new Date(h.submit_time).toLocaleString('zh-TW') : '-'}</td>
                <td class="py-2 px-4 text-center font-bold ${h.is_passed ? 'text-green-600' : 'text-red-600'}">
                    ${h.total_score}
                </td>
                <td class="py-2 px-4 text-center">
                    ${h.is_passed ? 
                        '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">通過</span>' : 
                        '<span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">未通過</span>'
                    }
                </td>
            </tr>
        `).join('');

        historyHtml = `
            <div class="mt-8 mb-4">
                <h3 class="text-lg font-bold text-gray-800 mb-2 border-b-2 border-gray-800 pb-1">
                    考試歷程 / Exam History
                </h3>
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-gray-100 border-b-2 border-gray-800">
                            <th class="py-2 px-4 text-center w-16">次數</th>
                            <th class="py-2 px-4 text-center">考試時間</th>
                            <th class="py-2 px-4 text-center w-24">分數</th>
                            <th class="py-2 px-4 text-center w-24">狀態</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyRows}
                    </tbody>
                </table>
            </div>
        `;
    }

    // 4. 構建 HTML 內容
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>成績單 - ${detail.basic_info.plan_title}</title>
          <meta charset="utf-8">
          ${styles}
          <style>
            @media print {
              @page { 
                margin: 20mm; 
                size: A4; 
              }
              body { 
                margin: 0; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
              }
            }
            body {
              background-color: white;
              font-family: "PingFang TC", "Heiti TC", "Microsoft JhengHei", "Microsoft YaHei", sans-serif;
            }
            /* 修正 iframe 內的 Tailwind transform */
            .transform { transform: var(--tw-transform); }
            .-rotate-3 { --tw-rotate: -3deg; transform: rotate(-3deg); }
            .rotate-12 { --tw-rotate: 12deg; transform: rotate(12deg); }
            .-rotate-12 { --tw-rotate: -12deg; transform: rotate(-12deg); }
            
            /* 強制分頁 */
            .page-break { page-break-before: always; }
            .break-inside-avoid { page-break-inside: avoid; }
            
            /* 封面頁佈局：讓簽名欄推到底部 */
            .cover-page {
                min-height: 250mm; /* 接近 A4 高度但留邊界 */
                display: flex;
                flex-direction: column;
            }
            .cover-content {
                flex: 1;
            }
          </style>
        </head>
        <body>
          <div id="print-root">
            
            <!-- 第一頁：封面 -->
            <div class="cover-page">
                <div class="cover-content">
                    ${contentElement.innerHTML}
                    ${historyHtml}
                </div>
                
                <!-- 簽名欄 (移至第一頁最下方) -->
                <div class="mt-8 border-t-2 border-gray-800 pt-4 break-inside-avoid">
                    <div class="grid grid-cols-2 gap-8">
                        <div>
                            <div class="text-sm text-gray-600 mb-1">考生簽名 / Examinee Signature</div>
                            <div class="border-b-2 border-gray-800 h-16"></div>
                        </div>
                        <div>
                            <div class="text-sm text-gray-600 mb-1">日期 / Date</div>
                            <div class="border-b-2 border-gray-800 h-16"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 分頁 -->
            <div class="page-break"></div>

            <!-- 第二頁起：答題詳情 -->
            <div class="pt-4">
                <h2 class="text-2xl font-bold text-gray-900 mb-6 border-b-2 border-gray-800 pb-2">
                    答題詳情 / Answer Details
                </h2>
                <div class="space-y-4">
                    ${detailsHtml}
                </div>
            </div>

          </div>
        </body>
      </html>
    `;

    // 5. 寫入與列印
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // 等待資源載入 (雖然是複製樣式，但 link 可能需要一點時間解析)
    iframe.onload = () => {
        setTimeout(() => {
            try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
            } catch (e) {
                console.error('Print failed:', e);
            } finally {
                // 給予足夠時間讓列印對話框出現後再移除 iframe
                // 注意：在某些瀏覽器，print() 是阻塞的，這行會在列印對話框關閉後執行
                // 在 Safari/Chrome 若非阻塞，設長一點的時間比較保險
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 2000);
            }
        }, 500);
    };
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
          <div className="p-4">
            <div className="border-2 border-gray-800 p-8 score-card-preview-content">
              <ScoreCardContent detail={detail} />
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
