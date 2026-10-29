/** Calendar-day distance, independent of clock time and browser time zone. */
export function daysUntilCalendarDate(target: string, now = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(target);
  if (!match) return 0;
  const targetDay = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((targetDay - today) / 86_400_000));
}

/** HTML date inputs use ISO date-only values, so lexical order is chronological. */
export function isValidReportPeriod(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
}
