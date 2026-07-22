import type { PlanOption } from '../../types/materials';
import { planProgress, selectablePlanOptions, todayYmd } from './planBindingUtils';

interface PlanBindingChecklistProps {
    planOptions: PlanOption[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    /** 訓練計畫頁上傳時鎖定本計畫（不可取消）。 */
    lockedPlanId?: number;
    /** 已綁定封存計畫的標題備援（例如詳情 plan_titles 對應）。 */
    archivedTitleById?: Record<number, string>;
    /**
     * 版面：stack＝一列一欄（側欄／窄欄預設）；
     * grid＝寬欄可多欄（預設至多兩欄，避免四欄擠成直書）。
     */
    layout?: 'stack' | 'grid';
}

const CELL: Record<'active' | 'expired', string> = {
    active: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    expired: 'border-orange-300 bg-orange-50 text-orange-950',
};

const BADGE: Record<'active' | 'expired', string> = {
    active: 'bg-emerald-200 text-emerald-900',
    expired: 'bg-orange-200 text-orange-900',
};

const LABEL: Record<'active' | 'expired', string> = {
    active: '進行中',
    expired: '已過期',
};

/**
 * 教材套組綁定訓練計畫：勾選清單；僅進行中／已過期可選。
 * 作法 A：已綁定之封存計畫以灰底唯讀顯示，儲存時仍保留其 id。
 */
const PlanBindingChecklist = ({
    planOptions, selectedIds, onChange, lockedPlanId, archivedTitleById = {},
    layout = 'stack',
}: PlanBindingChecklistProps) => {
    const today = todayYmd();
    const selectable = selectablePlanOptions(planOptions, today);
    const byId = new Map(planOptions.map(p => [p.id, p]));

    const archivedBound = selectedIds.flatMap(id => {
        const p = byId.get(id);
        if (p) {
            return planProgress(p, today) === 'archived' ? [{ id, title: p.title }] : [];
        }
        return [{ id, title: archivedTitleById[id] || `計畫 #${id}` }];
    });

    const toggle = (id: number, checked: boolean) => {
        if (id === lockedPlanId) return;
        if (checked) {
            onChange(Array.from(new Set([...selectedIds, id])));
        } else {
            onChange(selectedIds.filter(x => x !== id));
        }
    };

    if (selectable.length === 0 && archivedBound.length === 0) {
        return (
            <p className="text-sm text-gray-500">目前沒有可綁定的訓練計畫（不選＝通用教材）。</p>
        );
    }

    const gridClass = layout === 'grid'
        ? 'grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-0.5'
        : 'grid grid-cols-1 gap-2 max-h-56 overflow-y-auto p-0.5';

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                <span className="text-gray-600">圖例：</span>
                <span className={`px-2 py-0.5 rounded ${BADGE.active}`}>{LABEL.active}</span>
                <span className={`px-2 py-0.5 rounded ${BADGE.expired}`}>{LABEL.expired}</span>
                <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700">已封存（僅顯示既有綁定）</span>
            </div>
            <p className="text-xs text-gray-500">綁定訓練計畫（不選＝通用教材；已封存不可新勾，既有綁定會保留）</p>

            {archivedBound.length > 0 && (
                <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-600">已綁定（已封存，唯讀保留）</p>
                    <div className="flex flex-wrap gap-2">
                        {archivedBound.map(a => (
                            <span
                                key={a.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 bg-gray-100 text-sm font-medium text-gray-700"
                                title="計畫已封存：無法於勾選區取消；儲存時仍會保留此綁定"
                            >
                                {a.title}
                                <span className="text-xs text-gray-500">已封存</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className={gridClass}>
                {selectable.map(p => {
                    const progress = planProgress(p, today) as 'active' | 'expired';
                    const checked = selectedIds.includes(p.id);
                    const locked = p.id === lockedPlanId;
                    return (
                        <label
                            key={p.id}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer ${CELL[progress]} ${locked ? 'opacity-90' : ''} ${checked ? 'ring-2 ring-offset-1 ring-emerald-600 border-emerald-600' : ''}`}
                        >
                            <input
                                type="checkbox"
                                className="shrink-0 size-4"
                                checked={checked}
                                disabled={locked}
                                onChange={e => toggle(p.id, e.target.checked)}
                            />
                            <span className="min-w-0 flex-1 flex items-center justify-between gap-2">
                                <span className="text-sm font-bold truncate" title={p.title}>{p.title}</span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold ${BADGE[progress]}`}>
                                    {LABEL[progress]}{locked ? ' · 鎖定' : ''}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};

export default PlanBindingChecklist;
