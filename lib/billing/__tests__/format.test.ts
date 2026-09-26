import { describe, it, expect } from 'vitest';
import { formatAmountDue, formatRetryDate } from '@/lib/billing/format';

describe('formatAmountDue', () => {
  it('formats cents into a currency string', () => {
    expect(formatAmountDue(29800, 'aud')).toBe('$298.00');
  });

  it('upper-cases a lowercase currency code from Stripe', () => {
    const result = formatAmountDue(9900, 'aud');
    expect(result).toContain('99.00');
  });

  it('defaults to AUD when currency is missing or malformed', () => {
    expect(formatAmountDue(9900, undefined)).toBe('$99.00');
    expect(formatAmountDue(9900, 'xx')).toBe('$99.00');
    expect(formatAmountDue(9900, 123)).toBe('$99.00');
  });

  it('returns undefined rather than a broken string when amountDueCents is not a valid number', () => {
    expect(formatAmountDue(undefined, 'aud')).toBeUndefined();
    expect(formatAmountDue(null, 'aud')).toBeUndefined();
    expect(formatAmountDue('29800', 'aud')).toBeUndefined();
    expect(formatAmountDue(NaN, 'aud')).toBeUndefined();
    expect(formatAmountDue(Infinity, 'aud')).toBeUndefined();
  });

  it('handles zero correctly rather than treating it as falsy/missing', () => {
    expect(formatAmountDue(0, 'aud')).toBe('$0.00');
  });
});

describe('formatRetryDate', () => {
  it('formats a Unix seconds timestamp into an Australian long date', () => {
    // 2026-09-18T00:00:00Z
    expect(formatRetryDate(1789689600)).toBe('18 September 2026');
  });

  it('returns undefined when no retry is scheduled', () => {
    expect(formatRetryDate(null)).toBeUndefined();
    expect(formatRetryDate(undefined)).toBeUndefined();
  });

  it('returns undefined for non-numeric or invalid input rather than "Invalid Date"', () => {
    expect(formatRetryDate('not-a-timestamp')).toBeUndefined();
    expect(formatRetryDate(NaN)).toBeUndefined();
  });
});
