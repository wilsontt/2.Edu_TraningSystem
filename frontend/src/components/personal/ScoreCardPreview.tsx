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
                  className="text-7xl font-bold text-red-600 transform -rotate-3 score-handwriting" 
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
          <div className="absolute right-8 bottom-[-10px] transform rotate-12 pointer-events-none">
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

    // 中文字體堆疊（確保跨平台相容）
    const CHINESE_FONT_STACK = '"Noto Sans TC", "PingFang TC", "Heiti TC", "Microsoft JhengHei", "微軟正黑體", "Microsoft YaHei", sans-serif';

    // 生成題目詳情 HTML（使用 inline style 確保跨平台相容）
    const detailsHtml = detail.question_details.map((q) => {
        const options = parseOptions(q.options);
        const borderColor = q.is_correct ? '#22c55e' : '#ef4444';
        const bgColor = q.is_correct ? '#f0fdf4' : '#fef2f2';
        
        // 考生的答案 (處理多選 A,B)
        const userAnswers = (q.user_answer || '').split(',').map(s => s.trim()).filter(Boolean);

        // 選項列表 HTML（縮小字體、減少間距）
        const optionsListHtml = Object.entries(options).map(([key, value]) => {
            const isSelected = userAnswers.includes(key);
            const isCorrectOption = (q.correct_answer || '').includes(key);
            let iconHtml = '';
            
            if (isSelected) {
                iconHtml = isCorrectOption ? ICON_CHECK : ICON_X;
            }

            return `
                <div style="display:flex; align-items:flex-start; gap:6px; margin-bottom:2px; font-family:${CHINESE_FONT_STACK};">
                    <div style="width:20px; display:flex; justify-content:center; padding-top:2px;">${iconHtml}</div>
                    <div style="font-weight:500; color:#374151; font-size:13px;">${key}. ${value}</div>
                </div>
            `;
        }).join('');

        // 考生的答案顯示
        const userAnswerDisplay = userAnswers.map(ans => {
            const text = options[ans] || '';
            return `${ans}${text ? ` (${text})` : ''}`;
        }).join(', ') || '未作答';

        // 正確答案顯示
        const correctAnswers = (q.correct_answer || '').split(',').map(s => s.trim());
        const correctAnswerDisplay = correctAnswers.map(ans => {
            const text = options[ans] || '';
            return `${ans}${text ? ` (${text})` : ''}`;
        }).join(', ');

        const userAnswerColor = q.is_correct ? '#15803d' : '#b91c1c';

        return `
            <div style="border:2px solid ${borderColor}; border-radius:8px; padding:12px; margin-bottom:12px; page-break-inside:avoid; background:${bgColor}; font-family:${CHINESE_FONT_STACK};">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; border-bottom:1px solid #e5e7eb; padding-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:bold; color:#374151; font-size:14px;">第 ${q.question_number} 題</span>
                        <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:white; border:1px solid #e5e7eb; color:#6b7280;">
                            ${q.question_type}
                        </span>
                        ${q.is_correct ? ICON_CHECK_CIRCLE : ICON_X_CIRCLE}
                    </div>
                    <div style="font-weight:bold; color:${q.is_correct ? '#16a34a' : '#dc2626'}; font-size:14px;">
                        ${q.earned_points} / ${q.points}
                    </div>
                </div>
                
                <div style="margin-bottom:12px;">
                    <div style="font-weight:bold; color:#111827; margin-bottom:6px; font-size:15px;">${q.content}</div>
                    <div style="margin-left:8px;">
                        ${optionsListHtml}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; padding-top:8px; border-top:1px solid rgba(209,213,219,0.5); font-size:12px;">
                    <div>
                        <div style="color:#6b7280; margin-bottom:2px;">您的答案</div>
                        <div style="font-weight:500; color:${userAnswerColor}; font-size:12px;">
                            ${userAnswerDisplay}
                        </div>
                    </div>
                    <div>
                        <div style="color:#6b7280; margin-bottom:2px;">正確答案</div>
                        <div style="font-weight:500; color:#15803d; font-size:12px;">
                            ${correctAnswerDisplay}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 生成考試歷程 HTML（標示當前選中的記錄，全部使用 inline style）
    // 使用 submit_time 比對，因為 record_id 和 history[].id 可能不一致
    const currentSubmitTime = detail.basic_info.submit_time;
    let historyHtml = '';
    if (detail.history && detail.history.length > 0) {
        const historyRows = detail.history.map((h, idx) => {
            // 判斷是否為當前選中的考試記錄（使用 submit_time 比對）
            const isCurrentRecord = h.submit_time === currentSubmitTime;
            
            // 使用 inline style 確保跨平台相容
            const rowStyle = isCurrentRecord 
                ? 'border:2px solid #4f46e5; background-color:#eef2ff;' 
                : 'border-bottom:1px solid #e5e7eb;';
            
            const currentMarker = isCurrentRecord 
                ? `<div style="display:block; background:#4f46e5; color:white; font-size:10px; padding:2px 4px; border-radius:3px; margin-top:4px; text-align:center; font-family:${CHINESE_FONT_STACK};">本次</div>` 
                : '';
            
            const scoreColor = h.is_passed ? '#16a34a' : '#dc2626';
            const statusBg = h.is_passed ? '#dcfce7' : '#fee2e2';
            const statusColor = h.is_passed ? '#15803d' : '#b91c1c';
            const statusText = h.is_passed ? '通過' : '未通過';
            
            return `
                <tr style="${rowStyle} font-family:${CHINESE_FONT_STACK};">
                    <td style="padding:0.5rem 1rem; text-align:center; vertical-align:middle;">${idx + 1}${currentMarker}</td>
                    <td style="padding:0.5rem 1rem; text-align:center;">${h.submit_time ? new Date(h.submit_time).toLocaleString('zh-TW') : '-'}</td>
                    <td style="padding:0.5rem 1rem; text-align:center; font-weight:bold; color:${scoreColor};">
                        ${h.total_score}
                    </td>
                    <td style="padding:0.5rem 1rem; text-align:center;">
                        <span style="display:inline-block; background:${statusBg}; color:${statusColor}; font-size:12px; padding:4px 8px; border-radius:4px; font-weight:bold; font-family:${CHINESE_FONT_STACK};">${statusText}</span>
                    </td>
                </tr>
            `;
        }).join('');

        historyHtml = `
            <div style="margin-top:2rem; margin-bottom:1rem; font-family:${CHINESE_FONT_STACK};">
                <h3 style="font-size:1.125rem; font-weight:bold; color:#1f2937; margin-bottom:0.5rem; border-bottom:2px solid #1f2937; padding-bottom:0.25rem; font-family:${CHINESE_FONT_STACK};">
                    考試歷程 / Exam History
                </h3>
                <table style="width:100%; font-size:0.875rem; border-collapse:collapse; font-family:${CHINESE_FONT_STACK};">
                    <thead>
                        <tr style="background:#f3f4f6; border-bottom:2px solid #1f2937;">
                            <th style="padding:0.5rem 1rem; text-align:center; width:4rem; font-family:${CHINESE_FONT_STACK};">次數</th>
                            <th style="padding:0.5rem 1rem; text-align:center; font-family:${CHINESE_FONT_STACK};">考試時間</th>
                            <th style="padding:0.5rem 1rem; text-align:center; width:6rem; font-family:${CHINESE_FONT_STACK};">分數</th>
                            <th style="padding:0.5rem 1rem; text-align:center; width:6rem; font-family:${CHINESE_FONT_STACK};">狀態</th>
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
      <html lang="zh-TW">
        <head>
          <title>成績單 - ${detail.basic_info.plan_title}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <!-- Google Fonts 預連接 -->
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <!-- Noto Sans TC 中文字體 + Caveat 手寫體 -->
          <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Noto+Sans+TC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
          ${styles}
          <style>
            /* 內嵌字體定義作為備援 */
            @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Noto+Sans+TC:wght@300;400;500;600;700&display=swap');
            
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
            
            /* 全域字體設定 */
            html, body {
              background-color: white;
              font-family: ${CHINESE_FONT_STACK} !important;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* 確保所有元素都使用中文字體 */
            *, *::before, *::after {
              font-family: ${CHINESE_FONT_STACK} !important;
            }
            
            /* 手寫體字體樣式（用於總分）- 覆蓋全域 !important */
            .score-handwriting {
              font-family: "Caveat", "Comic Sans MS", "Patrick Hand", cursive !important;
            }
            
            /* 修正 iframe 內的 Tailwind transform */
            .transform { transform: var(--tw-transform); }
            .-rotate-3 { --tw-rotate: -3deg; transform: rotate(-3deg); }
            .rotate-12 { --tw-rotate: 12deg; transform: rotate(12deg); }
            .rotate-14 { --tw-rotate: 14deg; transform: rotate(14deg); }
            .-rotate-12 { --tw-rotate: -12deg; transform: rotate(-12deg); }
            
            /* 強制分頁 */
            .page-break { page-break-before: always; }
            .break-inside-avoid { page-break-inside: avoid; }
            
            /* 封面頁佈局：讓簽名欄推到底部 */
            .cover-page {
                min-height: 250mm;
                display: flex;
                flex-direction: column;
            }
            .cover-content {
                flex: 1;
            }
            
            /* 中文字體強化 */
            h1, h2, h3, h4, h5, h6, p, span, div, td, th, label {
              font-family: ${CHINESE_FONT_STACK} !important;
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
            <div style="padding-top:1rem;">
                <h2 style="font-size:1.5rem; font-weight:bold; color:#111827; margin-bottom:1.5rem; border-bottom:2px solid #1f2937; padding-bottom:0.5rem; font-family:${CHINESE_FONT_STACK};">
                    答題詳情 / Answer Details
                </h2>
                <div style="display:flex; flex-direction:column; gap:1rem;">
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

    // 等待資源載入 (字體需要時間從 Google Fonts 載入)
    iframe.onload = () => {
        // 等待字體載入完成 (使用 document.fonts.ready 或 fallback timeout)
        const waitForFonts = async () => {
            try {
                // 嘗試使用 Font Loading API 等待字體載入
                if (iframe.contentDocument?.fonts) {
                    await iframe.contentDocument.fonts.ready;
                }
            } catch {
                // 如果 Font Loading API 不可用，使用 fallback timeout
            }
            
            // 額外等待確保字體渲染完成
            setTimeout(() => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } catch (e) {
                    console.error('Print failed:', e);
                } finally {
                    // 給予足夠時間讓列印對話框出現後再移除 iframe
                    setTimeout(() => {
                        document.body.removeChild(iframe);
                    }, 3000);
                }
            }, 1000); // 增加等待時間，確保字體完全載入
        };
        
        waitForFonts();
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
