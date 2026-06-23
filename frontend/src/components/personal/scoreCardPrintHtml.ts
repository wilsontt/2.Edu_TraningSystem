/**
 * 共用成績單列印 HTML 產生器
 * ScoreCardPreview（個人路徑）與 DeptMemberScoreModal（部門批次 individual）均由此產生列印 HTML，
 * 確保兩者同源、輸出一致。
 */

import type { ScoreDetail } from './types';
import { parseBackendDateTime } from '../../utils/date';

// ── SVG icons（與 ScoreCardPreview 相同） ──────────────────────────────────────
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const ICON_X = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-600"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const ICON_CHECK_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
const ICON_X_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-600"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

export const CHINESE_FONT_STACK = '"Noto Sans TC", "PingFang TC", "Heiti TC", "Microsoft JhengHei", "微軟正黑體", "Microsoft YaHei", sans-serif';

// ── 型別定義 ───────────────────────────────────────────────────────────────────

export interface MemberPrintItem {
  has_exam: boolean;
  attendance_status: string;
  /** 有考試：完整 ScoreDetail；無考試：detail 為 null（需搭配下方基本欄位） */
  detail: ScoreDetail | null;
  name?: string;
  emp_id?: string;
  dept_name?: string;
  plan_title?: string;
}

// ── 內部 helper ────────────────────────────────────────────────────────────────

function parseOptions(optionsStr: string | null): Record<string, string> {
  if (!optionsStr) return {};
  try { return JSON.parse(optionsStr) as Record<string, string>; } catch { return {}; }
}

/** 依 detail.question_details 產生答題明細 HTML（與 ScoreCardPreview 相同邏輯） */
function buildDetailsHtml(questionDetails: ScoreDetail['question_details']): string {
  return questionDetails.map((q) => {
    const options = parseOptions(q.options);
    const borderColor = q.is_correct ? '#22c55e' : '#ef4444';
    const bgColor = q.is_correct ? '#f0fdf4' : '#fef2f2';

    const userAnswers = (q.user_answer || '').split(',').map(s => s.trim()).filter(Boolean);

    const optionsListHtml = Object.entries(options).map(([key, value]) => {
      const isSelected = userAnswers.includes(key);
      const isCorrectOption = (q.correct_answer || '').includes(key);
      const iconHtml = isSelected ? (isCorrectOption ? ICON_CHECK : ICON_X) : '';
      return `
        <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:2px;font-family:${CHINESE_FONT_STACK};">
          <div style="width:20px;display:flex;justify-content:center;padding-top:2px;">${iconHtml}</div>
          <div style="font-weight:500;color:#374151;font-size:13px;">${key}. ${value}</div>
        </div>`;
    }).join('');

    const userAnswerDisplay = userAnswers.map(ans => {
      const text = options[ans] || '';
      return `${ans}${text ? ` (${text})` : ''}`;
    }).join(', ') || '未作答';

    const correctAnswerDisplay = (q.correct_answer || '').split(',').map(s => s.trim()).map(ans => {
      const text = options[ans] || '';
      return `${ans}${text ? ` (${text})` : ''}`;
    }).join(', ');

    const userAnswerColor = q.is_correct ? '#15803d' : '#b91c1c';

    return `
      <div style="border:2px solid ${borderColor};border-radius:8px;padding:12px;margin-bottom:12px;page-break-inside:avoid;background:${bgColor};font-family:${CHINESE_FONT_STACK};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:bold;color:#374151;font-size:14px;">第 ${q.question_number} 題</span>
            <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:white;border:1px solid #e5e7eb;color:#6b7280;">${q.question_type}</span>
            ${q.is_correct ? ICON_CHECK_CIRCLE : ICON_X_CIRCLE}
          </div>
          <div style="font-weight:bold;color:${q.is_correct ? '#16a34a' : '#dc2626'};font-size:14px;">${q.earned_points} / ${q.points}</div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-weight:bold;color:#111827;margin-bottom:6px;font-size:15px;">${q.content}</div>
          <div style="margin-left:8px;">${optionsListHtml}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding-top:8px;border-top:1px solid rgba(209,213,219,0.5);font-size:12px;">
          <div>
            <div style="color:#6b7280;margin-bottom:2px;">您的答案</div>
            <div style="font-weight:500;color:${userAnswerColor};font-size:12px;">${userAnswerDisplay}</div>
          </div>
          <div>
            <div style="color:#6b7280;margin-bottom:2px;">正確答案</div>
            <div style="font-weight:500;color:#15803d;font-size:12px;">${correctAnswerDisplay}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/** 簽名欄 HTML（與 ScoreCardPreview 的 signatureFooterHtml 相同） */
function buildSignatureFooterHtml(): string {
  return `
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
    </div>`;
}

/**
 * 有考試成員的封面 HTML。
 * 結構與內容與 ScoreCardContent React 元件一致（移除 print:hidden 元素）。
 */
function buildExamCoverHtml(detail: ScoreDetail): string {
  const submitDate = detail.basic_info.submit_time
    ? parseBackendDateTime(detail.basic_info.submit_time)?.toLocaleDateString('zh-TW') || '-'
    : '-';
  const isPassedColor = detail.basic_info.is_passed ? '#16a34a' : '#dc2626';
  const resultText = detail.basic_info.is_passed ? '通過' : '未通過';
  const resultEn = detail.basic_info.is_passed ? 'PASS' : 'FAIL';

  return `
    <!-- 標題 -->
    <div class="text-center mt-0 pt-0 mb-1">
      <h1 class="text-3xl font-bold text-gray-900 mb-0">教育訓練測驗成績單</h1>
      <div class="text-sm text-gray-600">Training Examination Score Report</div>
    </div>

    <!-- 基本資訊 + 成績資訊 -->
    <div class="grid grid-cols-3 gap-6 mb-1">
      <div class="col-span-2 border-2 border-gray-800 mb-2 p-2">
        <div class="grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            <div class="text-sm text-gray-600 mb-0">考生姓名 / Name</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${detail.basic_info.name}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600 mb-0">員工編號 / Employee ID</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${detail.basic_info.emp_id}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600 mb-0">部門 / Department</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${detail.basic_info.dept_name}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600 mb-0">測驗日期 / Date</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${submitDate}</div>
          </div>
        </div>
      </div>

      <div class="col-span-1 mb-2">
        <div class="h-full flex flex-col">
          <div class="flex-1 border-2 border-gray-800 p-4 flex flex-col justify-center items-center">
            <div class="text-base text-gray-600 mb-2">總分 / Total Score</div>
            <div class="text-7xl font-bold text-red-600 transform -rotate-3 score-handwriting"
                 style="text-shadow:2px 2px 0px rgba(0,0,0,0.1);font-family:Caveat,'Comic Sans MS','Patrick Hand',cursive;">
              ${detail.basic_info.total_score}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 訓練計畫 + 浮印結果 -->
    <div class="mb-5 relative">
      <div class="flex items-end justify-between">
        <div class="w-2/3">
          <div class="text-sm text-gray-600 mb-1">訓練計畫 / Training Plan</div>
          <div class="font-bold text-xl border-b-2 border-gray-800 pb-2">${detail.basic_info.plan_title}</div>
        </div>
        <div class="absolute right-8 bottom-[-10px] transform rotate-12 pointer-events-none">
          <div style="border:4px double ${isPassedColor};color:${isPassedColor};padding:8px 32px;border-radius:8px;min-width:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);">
            <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;opacity:0.7;margin-bottom:0;">Result</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:1.5rem;font-weight:bold;">${resultText}</span>
              <span style="font-size:1.875rem;font-weight:900;letter-spacing:0.1em;">${resultEn}</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/** 未考試成員的封面 HTML（無分數、無結果章，無自創文案） */
function buildNoExamCoverHtml(member: {
  name: string; emp_id: string; dept_name: string; plan_title: string;
}): string {
  return `
    <!-- 標題 -->
    <div class="text-center mt-0 pt-0 mb-1">
      <h1 class="text-3xl font-bold text-gray-900 mb-0">教育訓練測驗成績單</h1>
      <div class="text-sm text-gray-600">Training Examination Score Report</div>
    </div>

    <!-- 基本資訊 -->
    <div class="grid grid-cols-3 gap-6 mb-1">
      <div class="col-span-2 border-2 border-gray-800 mb-2 p-2">
        <div class="grid grid-cols-2 gap-x-8 gap-y-1">
          <div>
            <div class="text-sm text-gray-600 mb-0">考生姓名 / Name</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${member.name}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600 mb-0">員工編號 / Employee ID</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${member.emp_id}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600 mb-0">部門 / Department</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">${member.dept_name}</div>
          </div>
          <div>
            <div class="text-sm text-gray-600 mb-0">測驗日期 / Date</div>
            <div class="font-bold text-lg border-b-2 border-gray-800 pb-1">-</div>
          </div>
        </div>
      </div>

      <div class="col-span-1 mb-2">
        <div class="h-full flex flex-col">
          <div class="flex-1 border-2 border-gray-800 p-4 flex flex-col justify-center items-center">
            <div class="text-base text-gray-600 mb-2">總分 / Total Score</div>
            <div class="text-7xl font-bold text-gray-400">-</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 訓練計畫 -->
    <div class="mb-5 relative">
      <div class="flex items-end justify-between">
        <div class="w-2/3">
          <div class="text-sm text-gray-600 mb-1">訓練計畫 / Training Plan</div>
          <div class="font-bold text-xl border-b-2 border-gray-800 pb-2">${member.plan_title}</div>
        </div>
      </div>
    </div>`;
}

// ── 共用 CSS（與 ScoreCardPreview 相同） ──────────────────────────────────────
function buildPrintStyles(pageStyles: string): string {
  return `
    ${pageStyles}
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Noto+Sans+TC:wght@300;400;500;600;700&display=swap');
      @media print {
        @page { margin: 20mm; size: A4; }
        body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      html, body { background-color: white; font-family: ${CHINESE_FONT_STACK} !important; -webkit-font-smoothing: antialiased; }
      *, *::before, *::after { font-family: ${CHINESE_FONT_STACK} !important; }
      .score-handwriting { font-family: "Caveat", "Comic Sans MS", "Patrick Hand", cursive !important; }
      .transform { transform: var(--tw-transform); }
      .-rotate-3 { --tw-rotate: -3deg; transform: rotate(-3deg); }
      .rotate-12 { --tw-rotate: 12deg; transform: rotate(12deg); }
      .rotate-14 { --tw-rotate: 14deg; transform: rotate(14deg); }
      .-rotate-12 { --tw-rotate: -12deg; transform: rotate(-12deg); }
      .page-break { page-break-before: always; }
      .break-inside-avoid { page-break-inside: avoid; }
      .cover-page { min-height: 250mm; display: flex; flex-direction: column; }
      .cover-content { flex: 1; }
      h1, h2, h3, h4, h5, h6, p, span, div, td, th, label { font-family: ${CHINESE_FONT_STACK} !important; }
    </style>`;
}

// ── 公開 API ───────────────────────────────────────────────────────────────────

/**
 * 產生批次列印 HTML。
 * 供 ScoreCardPreview（單人）與 DeptMemberScoreModal（多人 individual）共用。
 * @param members - 列印成員清單
 * @param includeSignature - 是否附加簽名欄
 */
export function buildBatchPrintHtml(
  members: MemberPrintItem[],
  includeSignature: boolean,
): string {
  const pageStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML)
    .join('');

  const signatureFooterHtml = includeSignature ? buildSignatureFooterHtml() : '';

  const pagesHtml = members.map((m, idx) => {
    const isLast = idx === members.length - 1;
    const memberPageBreak = isLast ? '' : '<div class="page-break"></div>';

    const memberInfo = {
      name: m.name ?? m.detail?.basic_info.name ?? '',
      emp_id: m.emp_id ?? m.detail?.basic_info.emp_id ?? '',
      dept_name: m.dept_name ?? m.detail?.basic_info.dept_name ?? '',
      plan_title: m.plan_title ?? m.detail?.basic_info.plan_title ?? '',
    };

    if (m.has_exam && m.detail) {
      const coverHtml = buildExamCoverHtml(m.detail);
      const hasQuestions = m.detail.question_details.length > 0;
      const detailsHtml = hasQuestions ? buildDetailsHtml(m.detail.question_details) : '';

      return `
        <div class="cover-page">
          <div class="cover-content">${coverHtml}</div>
          ${signatureFooterHtml}
        </div>
        ${hasQuestions ? `
          <div class="page-break"></div>
          <div style="padding-top:1rem;">
            <h2 style="font-size:1.5rem;font-weight:bold;color:#111827;margin-bottom:1.5rem;border-bottom:2px solid #1f2937;padding-bottom:0.5rem;font-family:${CHINESE_FONT_STACK};">
              答題詳情 / Answer Details
            </h2>
            <div style="display:flex;flex-direction:column;gap:1rem;">${detailsHtml}</div>
          </div>` : ''}
        ${memberPageBreak}`;
    }

    const coverHtml = buildNoExamCoverHtml(memberInfo);
    return `
      <div class="cover-page">
        <div class="cover-content">${coverHtml}</div>
        ${signatureFooterHtml}
      </div>
      ${memberPageBreak}`;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="zh-TW">
      <head>
        <title>教育訓練測驗成績單</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Noto+Sans+TC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        ${buildPrintStyles(pageStyles)}
      </head>
      <body>
        <div id="print-root">${pagesHtml}</div>
      </body>
    </html>`;
}

/** 共用 iframe 列印邏輯 */
export function printHtmlInIframe(htmlContent: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.onload = () => {
    const run = async () => {
      try {
        if (iframe.contentDocument?.fonts) await iframe.contentDocument.fonts.ready;
      } catch { /* ignore */ }
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('Print failed:', e);
        } finally {
          setTimeout(() => { document.body.removeChild(iframe); }, 3000);
        }
      }, 1000);
    };
    void run();
  };
}
