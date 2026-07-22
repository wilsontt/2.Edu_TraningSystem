/** 報到歷程 result 代碼 → 承辦人可讀中文 */
const CHECKIN_RESULT_LABELS: Record<string, string> = {
  success: '報到成功',
  already_checked: '已報到過',
  skipped_not_target: '非本計畫對象',
  plan_not_applicable: '計畫未開放／已過期',
  batch_closed: '合併報到已關閉',
};

export interface AttendanceCheckinEventLabelInput {
  source: string;
  event_type: string;
  result: string;
  batch_label?: string | null;
}

/**
 * 將報到歷程事件轉為承辦人可讀的一句話（不含時間）。
 * 例：合併報到「0721 上午場」· 報到成功
 */
export function formatAttendanceCheckinEventLabel(ev: AttendanceCheckinEventLabelInput): string {
  const outcome = CHECKIN_RESULT_LABELS[ev.result] ?? ev.result;

  if (ev.source === 'qr_batch' || ev.event_type === 'batch_checkin') {
    const tag = ev.batch_label?.trim();
    if (tag) {
      return `合併報到「${tag}」· ${outcome}`;
    }
    return `合併報到 · ${outcome}`;
  }

  if (ev.source === 'qr_single' || ev.event_type === 'single_checkin') {
    return `計畫 QR · ${outcome}`;
  }

  if (ev.source === 'exam_center_button') {
    return `考試中心報到 · ${outcome}`;
  }

  return `報到 · ${outcome}`;
}
