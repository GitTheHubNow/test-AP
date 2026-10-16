// lib/landing/pricing.ts
//
// The numbers behind the marketing page's copy and its margin calculator.
// Pure functions — no React, no DOM — so the maths is unit-tested.
//
// ⚠️  THESE ARE MARKETING FIGURES AND ARE NOT THE SAME AS WHAT THE BILLING
// SYSTEM CHARGES. The landing page promises a $299 wholesale fee per memorial,
// payable at handover. lib/billing/pricing.ts currently charges
// DEFAULT_MEMORIAL_FEE_CENTS = $199, recorded when the memorial is CREATED.
// Until those agree, a funeral home will be quoted one price and invoiced
// another. See the note in lib/landing/__tests__/pricing.test.ts.

export const WHOLESALE_FEE   = 299; // per memorial, AUD
export const RETAIL_DEFAULT  = 899; // suggested retail price
export const RETAIL_MIN      = 699;
export const RETAIL_MAX      = 999;
export const RETAIL_STEP     = 10;
export const SUBSCRIPTION    = 99;  // per month
export const FREE_MONTHS     = 1;   // "first month free"
export const CASES_MIN       = 1;
export const CASES_MAX       = 30;
export const CASES_DEFAULT   = 10;

/** What the funeral home keeps on one memorial. */
export const marginPerMemorial = (retail: number): number => retail - WHOLESALE_FEE;

/**
 * Net profit over 12 months: every memorial's margin, less the monthly
 * subscription for each PAID month (the first FREE_MONTHS are free).
 * Matches the original page exactly: cases × margin × 12 − $99 × 11.
 */
export function yearlyProfit(casesPerMonth: number, retail: number): number {
  const paidMonths = 12 - FREE_MONTHS;
  return casesPerMonth * marginPerMemorial(retail) * 12 - SUBSCRIPTION * paidMonths;
}

/** "$70,911" — whole dollars, en-US grouping, as on the original page. Negative values keep their sign. */
export function formatUsd(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-US');
}

/** Clamp a slider value into range (guards against NaN from a half-typed/odd input). */
export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
