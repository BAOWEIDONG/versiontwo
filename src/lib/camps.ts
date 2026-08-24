import type { Camp } from '../types';

/** 将 "YYYY-MM-DD" 格式化为 "M.D" */
export function fmtShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 将 "YYYY-MM-DD" 格式化为 "YYYY-MM-DD"（保留完整年月日） */
export function fmtFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 营期日期区间展示，如 "2026-08-24 — 2026-09-20"，缺日期部分回退 "--" */
export function campDateRange(camp: Camp): string {
  if (!camp.startDate && !camp.endDate) return '--';
  const s = camp.startDate ? fmtFullDate(camp.startDate) : '--';
  const e = camp.endDate ? fmtFullDate(camp.endDate) : '--';
  return `${s} — ${e}`;
}

/** 最新营期：按 startDate 降序取最大者（无 startDate 视为最早）；空数组返回 null */
export function latestCamp(camps: Camp[]): Camp | null {
  if (camps.length === 0) return null;
  return [...camps].sort((a, b) => {
    const av = a.startDate ? new Date(a.startDate).getTime() : -Infinity;
    const bv = b.startDate ? new Date(b.startDate).getTime() : -Infinity;
    return bv - av;
  })[0];
}

/** 默认展示营期：优先最新营期，兜底第一个 */
export function latestOrFirst(camps: Camp[]): Camp | null {
  return latestCamp(camps) ?? camps[0] ?? null;
}

/** 默认展示营期 id：优先最新，兜底第一个；空返回 null */
export function latestOrFirstId(camps: Camp[]): string | null {
  return latestOrFirst(camps)?.id ?? null;
}