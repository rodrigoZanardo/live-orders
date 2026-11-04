/** Reads a required environment variable; the app refuses to start without it. */
export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required (see .env.example).`);
  }
  return value;
}

/** How long an order may stay in PREPARING before it is flagged late (env LATE_AFTER_MINUTES, default 10). */
export function lateAfterMs(): number {
  const minutes = Number(process.env.LATE_AFTER_MINUTES ?? 10);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;
}

/** IANA time zone that decides the business day (daily order numbers, "today's orders"). */
export function businessTimeZone(): string {
  return process.env.BUSINESS_TIME_ZONE?.trim() || 'America/Sao_Paulo';
}
