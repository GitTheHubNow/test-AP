import { describe, it, expect } from 'vitest';
import {
  periodBounds, periodKeyFor, previousPeriodKey, isPeriodClosed,
  isValidPeriodKey, formatPeriodLabel,
} from '../period';

const SYD = 'Australia/Sydney';

describe('periodBounds', () => {
  it('resolves a non-DST month in Sydney (+10)', () => {
    // Sept 2026: 1 Sep 00:00 +10 = 31 Aug 14:00Z ; 1 Oct 00:00 +10 = 30 Sep 14:00Z
    const { start, end } = periodBounds('2026-09', SYD);
    expect(start.toISOString()).toBe('2026-08-31T14:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T14:00:00.000Z');
  });

  it('handles the month DST starts in (October 2026: +10 → +11 on 4 Oct)', () => {
    const { start, end } = periodBounds('2026-10', SYD);
    expect(start.toISOString()).toBe('2026-09-30T14:00:00.000Z');
    // 1 Nov 00:00 +11 = 31 Oct 13:00Z — October is 31 days + 1 hour long in absolute time
    expect(end.toISOString()).toBe('2026-10-31T13:00:00.000Z');
  });

  it('handles the month DST ends in (April 2026: +11 → +10 on 5 Apr)', () => {
    const { start, end } = periodBounds('2026-04', SYD);
    expect(start.toISOString()).toBe('2026-03-31T13:00:00.000Z'); // 1 Apr 00:00 +11
    expect(end.toISOString()).toBe('2026-04-30T14:00:00.000Z');   // 1 May 00:00 +10
  });

  it('handles a zone with no DST', () => {
    const { start } = periodBounds('2026-11', 'Australia/Brisbane');
    expect(start.toISOString()).toBe('2026-10-31T14:00:00.000Z');
  });

  it('works in UTC', () => {
    const { start, end } = periodBounds('2026-02', 'UTC');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('rolls December into the next year', () => {
    expect(periodBounds('2026-12', 'UTC').end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('has no gaps or overlaps: each month ends exactly where the next starts', () => {
    for (let m = 1; m <= 11; m++) {
      const a = periodBounds(`2026-${String(m).padStart(2, '0')}`, SYD);
      const b = periodBounds(`2026-${String(m + 1).padStart(2, '0')}`, SYD);
      expect(a.end.getTime()).toBe(b.start.getTime());
    }
  });

  it('rejects malformed keys', () => {
    expect(() => periodBounds('2026-13', 'UTC')).toThrow();
    expect(() => periodBounds('26-01', 'UTC')).toThrow();
  });
});

describe('periodKeyFor', () => {
  it('assigns by the billing timezone, not UTC', () => {
    // 31 Oct 13:30Z is already 1 Nov 00:30 in Sydney (+11)
    const at = new Date('2026-10-31T13:30:00Z');
    expect(periodKeyFor(at, SYD)).toBe('2026-11');
    expect(periodKeyFor(at, 'UTC')).toBe('2026-10');
  });

  it('an instant exactly on the boundary belongs to the NEW month', () => {
    const { end } = periodBounds('2026-10', SYD);
    expect(periodKeyFor(end, SYD)).toBe('2026-11');
    expect(periodKeyFor(new Date(end.getTime() - 1), SYD)).toBe('2026-10');
  });
});

describe('helpers', () => {
  it('previousPeriodKey crosses the year boundary', () => {
    expect(previousPeriodKey('2026-01')).toBe('2025-12');
    expect(previousPeriodKey('2026-10')).toBe('2026-09');
  });

  it('isPeriodClosed only after the month has fully ended', () => {
    expect(isPeriodClosed('2026-09', new Date('2026-09-30T13:59:59Z'), SYD)).toBe(false);
    expect(isPeriodClosed('2026-09', new Date('2026-09-30T14:00:00Z'), SYD)).toBe(true);
  });

  it('isValidPeriodKey', () => {
    expect(isValidPeriodKey('2026-09')).toBe(true);
    expect(isValidPeriodKey('2026-9')).toBe(false);
    expect(isValidPeriodKey('2026-00')).toBe(false);
    expect(isValidPeriodKey(undefined)).toBe(false);
  });

  it('formatPeriodLabel', () => {
    expect(formatPeriodLabel('2026-09')).toBe('September 2026');
  });
});
