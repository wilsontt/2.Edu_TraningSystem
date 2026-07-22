/** 報到結果代碼 → 承辦人可讀中文 */
const CHECKIN_RESULT_LABELS: Record<string, string> = {
  success: '準時報到',
  /** 舊文案對照（若後端仍回傳此字串作 result） */
  報到成功: '準時報到',
  already_checked: '已報到過',
  skipped_not_target: '非本計畫對象',
  plan_not_applicable: '計畫未開放／已過期',
  batch_closed: '合併報到已關閉',
  cleared: '取消請假',
  override: '個別覆寫',
};

/** 未到原因代碼 → 中文 */
export const ABSENCE_REASON_LABELS: Record<string, string> = {
  sick_leave: '病假',
  business_trip: '出差',
  official_leave: '公假',
  other: '其他',
  cancel_leave: '取消請假',
};

export interface AttendanceCheckinEventLabelInput {
  source: string;
  event_type: string;
  result: string;
  batch_label?: string | null;
  reason_code?: string | null;
  reason_text?: string | null;
}

/**
 * 將報到歷程事件轉為承辦人可讀的一句話（不含時間）。
 * 例：合併報到「0721 上午場」· 準時報到；病假（合併報到「0721 上午場」）
 */
export function formatAttendanceCheckinEventLabel(ev: AttendanceCheckinEventLabelInput): string {
  const isAbsenceEvent =
    ev.event_type === 'absence_reason_updated' ||
    ev.event_type === 'absence_reason_cleared' ||
    ev.source === 'batch_absence' ||
    ev.source === 'plan_absence';

  if (isAbsenceEvent) {
    let base: string;
    if (ev.event_type === 'absence_reason_cleared' || ev.result === 'cleared') {
      base = '取消請假';
    } else {
      const code = ev.reason_code || '';
      base = ABSENCE_REASON_LABELS[code] ?? (code || '未到原因');
      if (code === 'other' && (ev.reason_text || '').trim()) {
        base = `${base}：${ev.reason_text!.trim()}`;
      }
    }
    if (ev.source === 'batch_absence') {
      const tag = ev.batch_label?.trim();
      return tag ? `${base}（合併報到「${tag}」）` : `${base}（合併報到）`;
    }
    if (ev.source === 'plan_absence') {
      return ev.result === 'override' ? `${base}（個別覆寫）` : base;
    }
    return base;
  }

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
