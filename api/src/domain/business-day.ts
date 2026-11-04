/** The business day (YYYY-MM-DD) a moment belongs to in the given IANA time zone. Daily order numbers restart each day. */
export function businessDay(moment: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30 or 2026-13-01). */
export function isBusinessDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
