/**
 * 後端 datetime 欄位（如 created_at、submit_time、checkin_time、authorized_at）一律以 naive UTC
 * （無時區標記，例如 "2026-06-23T07:54:00.123456"）序列化。JavaScript 的 `Date`
 * 建構子遇到無時區標記的 ISO 字串會當作「本機時區」解析，導致顯示時間整體偏移
 * 時區差（台灣 UTC+8 會少 8 小時，跨日時間點甚至會顯示錯誤的日期）。
 *
 * 所有顯示後端 datetime 欄位的地方都應透過 `parseBackendDateTime()` 還原為正確的
 * UTC 時間點，再呼叫 `toLocaleString()` / `toLocaleDateString()` 轉換為本機顯示。
 *
 * 注意：純日期欄位（後端 `Date` 型別，如 training_date，序列化為 "YYYY-MM-DD"
 * 不含時間）不受此問題影響，不需要、也不應該套用此函式。
 */
export function parseBackendDateTime(value: string | null | undefined): Date | null {
    if (!value) return null;
    // 已含時區標記（結尾 Z 或 +08:00 等）則不重複附加
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
    const date = new Date(hasTimezone ? value : `${value}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}
