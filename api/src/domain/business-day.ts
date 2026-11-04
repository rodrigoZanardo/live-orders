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
