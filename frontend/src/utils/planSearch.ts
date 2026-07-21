/**
 * 訓練計畫列表／合併報到候選關鍵字與日期比對（前端篩選）。
 * - 一般關鍵字：計畫名稱、年份、開始／結束日期字串、開課單位、分類名稱
 * - 完整 YYYY-MM-DD：另判斷該日是否落在「開始日期～結束日期」區間（無結束日則等同開始日）
 * - 合併報到候選：場次日與關鍵字為 **OR**（任一符合即可；皆空則全部）
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PlanSearchable = {
  title: string;
  year: string;
  training_date: string;
  end_date?: string | null;
  deptName?: string | null;
  categoryName?: string | null;
};

/**
 * 判斷指定日是否落在計畫開始～結束區間內（無結束日則等同開始日）。
 */
export function planCoversDate(
  plan: Pick<PlanSearchable, 'training_date' | 'end_date'>,
  dateStr: string,
): boolean {
  const day = dateStr.trim();
  if (!ISO_DATE_RE.test(day)) return false;
  const start = plan.training_date || '';
  const end = plan.end_date || plan.training_date || '';
  if (!start) return false;
  return start <= day && day <= end;
}

/**
 * 判斷一筆訓練計畫是否符合搜尋關鍵字。
 * @param plan 可搜尋欄位（含已解析的單位／分類名稱）
 * @param rawKeyword 使用者輸入（會 trim；大小寫不敏感）
 */
export function matchesPlanSearch(plan: PlanSearchable, rawKeyword: string): boolean {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) return true;

  const start = plan.training_date || '';
  const end = plan.end_date || plan.training_date || '';

  if (ISO_DATE_RE.test(keyword) && start && end) {
    if (start <= keyword && keyword <= end) {
      return true;
    }
  }

  const title = plan.title.toLowerCase();
  const year = (plan.year || '').toLowerCase();
  const deptName = (plan.deptName || '').toLowerCase();
  const categoryName = (plan.categoryName || '').toLowerCase();

  return (
    title.includes(keyword) ||
    year.includes(keyword) ||
    start.includes(keyword) ||
    (plan.end_date || '').includes(keyword) ||
    deptName.includes(keyword) ||
    categoryName.includes(keyword)
  );
}

/**
 * 合併報到候選篩選：場次日（區間）與關鍵字為 OR；兩者皆空則全部通過。
 */
export function matchesBatchCandidateFilter(
  plan: PlanSearchable,
  options: { filterDate?: string | null; keyword?: string | null },
): boolean {
  const filterDate = (options.filterDate || '').trim();
  const keyword = (options.keyword || '').trim();
  const hasDate = ISO_DATE_RE.test(filterDate);
  const hasKeyword = keyword.length > 0;

  if (!hasDate && !hasKeyword) return true;

  const dateOk = hasDate && planCoversDate(plan, filterDate);
  const keywordOk = hasKeyword && matchesPlanSearch(plan, keyword);
  return dateOk || keywordOk;
}
