/**
 * 訓練計畫列表關鍵字比對（前端篩選）。
 * - 一般關鍵字：計畫名稱、年份、開始／結束日期字串、開課單位、分類名稱
 * - 完整 YYYY-MM-DD：另判斷該日是否落在「開始日期～結束日期」區間（無結束日則等同開始日）
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
