/** Reads a required environment variable; the app refuses to start without it. */
export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required (see .env.example).`);
  }
  return value;
}

/** IANA time zone that decides the business day (daily order numbers, "today's orders"). */
export function businessTimeZone(): string {
  return process.env.BUSINESS_TIME_ZONE?.trim() || 'America/Sao_Paulo';
}
