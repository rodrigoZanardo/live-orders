import { businessDay } from '../src/domain/business-day';

describe('businessDay', () => {
  it('uses the local date of the time zone, not UTC', () => {
    // 01:30 UTC on Nov 4 is still 22:30 on Nov 3 in São Paulo
    const moment = new Date('2026-11-04T01:30:00Z');
    expect(businessDay(moment, 'America/Sao_Paulo')).toBe('2026-11-03');
    expect(businessDay(moment, 'UTC')).toBe('2026-11-04');
  });
});
