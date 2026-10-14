import { describe, it, expect } from 'vitest';
import {
  getOrgRates, priceForEvent, baseFeeApplies, isInTrial, formatMoney,
  DEFAULT_BASE_FEE_CENTS, DEFAULT_MEMORIAL_FEE_CENTS,
} from '../pricing';

const defaults = getOrgRates({ customBaseFeeCents: null, customMemorialFeeCents: null });
const NOW = new Date('2026-10-14T00:00:00Z');
const PAST = new Date('2026-09-01T00:00:00Z');
const FUTURE = new Date('2026-11-01T00:00:00Z');

describe('getOrgRates', () => {
  it('uses the platform defaults ($99 base, $199 per memorial)', () => {
    expect(defaults.baseFeeCents).toBe(9900);
    expect(defaults.memorialFeeCents).toBe(19900);
    expect(DEFAULT_BASE_FEE_CENTS).toBe(9900);
    expect(DEFAULT_MEMORIAL_FEE_CENTS).toBe(19900);
  });

  it('per-site custom rates win, including a custom rate of 0', () => {
    const r = getOrgRates({ customBaseFeeCents: 5000, customMemorialFeeCents: 0 });
    expect(r.baseFeeCents).toBe(5000);
    expect(r.memorialFeeCents).toBe(0); // 0 is a real value, not "unset"
  });
});

describe('priceForEvent', () => {
  it('charges the memorial fee after the trial', () => {
    expect(priceForEvent('MEMORIAL_CREATED', defaults, PAST, NOW).unitPriceCents).toBe(19900);
    expect(priceForEvent('MEMORIAL_CREATED', defaults, null, NOW).unitPriceCents).toBe(19900);
  });

  it('waives the fee (but still returns a record) during the trial', () => {
    const p = priceForEvent('MEMORIAL_CREATED', defaults, FUTURE, NOW);
    expect(p.unitPriceCents).toBe(0);
    expect(p.note).toMatch(/trial/i);
  });

  it('tribute videos are tracked at $0', () => {
    expect(priceForEvent('TRIBUTE_VIDEO_RENDERED', defaults, null, NOW).unitPriceCents).toBe(0);
  });

  it('uses a site-specific rate', () => {
    const r = getOrgRates({ customBaseFeeCents: null, customMemorialFeeCents: 15000 });
    expect(priceForEvent('MEMORIAL_CREATED', r, null, NOW).unitPriceCents).toBe(15000);
  });
});

describe('isInTrial', () => {
  it('is false with no trial date, and at the exact end instant', () => {
    expect(isInTrial(null, NOW)).toBe(false);
    expect(isInTrial(NOW, NOW)).toBe(false);
    expect(isInTrial(FUTURE, NOW)).toBe(true);
  });
});

describe('baseFeeApplies', () => {
  const periodEnd = new Date('2026-10-31T13:00:00Z');
  it('charges when there was never a trial', () => expect(baseFeeApplies(null, periodEnd, false)).toBe(true));
  it('charges when the trial ended before the period closed', () => {
    expect(baseFeeApplies(new Date('2026-10-10T00:00:00Z'), periodEnd, false)).toBe(true);
  });
  it('does not charge while still in trial at period end', () => {
    expect(baseFeeApplies(new Date('2026-11-05T00:00:00Z'), periodEnd, false)).toBe(false);
  });
  it('does not charge a suspended site', () => expect(baseFeeApplies(null, periodEnd, true)).toBe(false));
});

describe('formatMoney', () => {
  it('formats integer cents as AUD', () => {
    expect(formatMoney(29800)).toBe('$298.00');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(9900)).toBe('$99.00');
  });
});
