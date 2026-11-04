import { businessDay, isBusinessDay } from '../src/domain/business-day';

describe('businessDay', () => {
  it('uses the local date of the time zone, not UTC', () => {
    // 01:30 UTC on Nov 4 is still 22:30 on Nov 3 in São Paulo
    const moment = new Date('2026-11-04T01:30:00Z');
    expect(businessDay(moment, 'America/Sao_Paulo')).toBe('2026-11-03');
    expect(businessDay(moment, 'UTC')).toBe('2026-11-04');
  });
});

describe('isBusinessDay', () => {
  it.each(['2026-11-03', '2024-02-29'])('accepts %p', (value) => {
    expect(isBusinessDay(value)).toBe(true);
  });

  it.each(['2026-13-45', '2026-02-30', '2025-02-29', '26-11-03', '2026-11-3', ''])(
    'refuses %p',
    (value) => {
      expect(isBusinessDay(value)).toBe(false);
    },
  );
});
