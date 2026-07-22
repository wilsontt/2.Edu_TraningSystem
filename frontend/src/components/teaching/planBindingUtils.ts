import type { PlanOption } from '../../types/materials';

export type PlanProgress = 'active' | 'expired' | 'archived';

/** 今日字串 YYYY-MM-DD（本地時區）。 */
export function todayYmd(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 訓練計畫進度：封存優先，其次結束日早於今日為已過期，其餘為進行中。 */
export function planProgress(p: PlanOption, today: string = todayYmd()): PlanProgress {
    if (p.is_archived) return 'archived';
    if (p.end_date && p.end_date < today) return 'expired';
    return 'active';
}

const PROGRESS_ORDER: Record<PlanProgress, number> = { active: 0, expired: 1, archived: 2 };

/** 可勾選清單：排除封存；順序進行中 → 已過期，同組依標題。 */
export function selectablePlanOptions(plans: PlanOption[], today: string = todayYmd()): PlanOption[] {
    return plans
        .filter(p => planProgress(p, today) !== 'archived')
        .sort((a, b) => {
            const pa = planProgress(a, today);
            const pb = planProgress(b, today);
            if (PROGRESS_ORDER[pa] !== PROGRESS_ORDER[pb]) return PROGRESS_ORDER[pa] - PROGRESS_ORDER[pb];
            return a.title.localeCompare(b.title, 'zh-Hant');
        });
}
