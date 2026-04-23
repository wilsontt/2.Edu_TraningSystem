/**
 * 成績列印（考試歷程／成績詳情）之「三態」：未明確選擇前為 unset。
 * 關閉 Modal 或切換 record/history 時應重設為 unset（見各元件 useEffect）。
 */
export type SignatureTriState = 'unset' | 'no' | 'yes';

/** 詢問2：清單／逐筆；未選前為 unset。 */
export type PrintModeTriState = 'unset' | 'list' | 'individual';
