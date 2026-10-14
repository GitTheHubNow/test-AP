// lib/billing/pricing.ts
//
// Pricing rules for manual (invoice-based) billing. Pure functions only —
// no database, no env reads — so the money maths is trivially unit-testable.
//
// ALL MONEY IS INTEGER CENTS. Never store or add dollars as floats.
//
// Defaults match the pricing the app already advertised under Stripe:
// $99/month base fee + $199 per memorial created, AUD. A site can have
// negotiated rates (Organisation.customBaseFeeCents /
// customMemorialFeeCents); those win over the defaults.

import type { UsageEventType } from '@prisma/client';

export const CURRENCY = 'AUD';

export const DEFAULT_BASE_FEE_CENTS     = 99_00;
export const DEFAULT_MEMORIAL_FEE_CENTS = 199_00;
// Tribute-video renders are tracked in the ledger but not charged — same
// as the Stripe-era model, where only memorials were billed.
export const DEFAULT_VIDEO_FEE_CENTS    = 0;

export interface OrgRates {
  baseFeeCents:     number;
  memorialFeeCents: number;
  videoFeeCents:    number;
}

export interface OrgRateInputs {
  customBaseFeeCents:     number | null;
  customMemorialFeeCents: number | null;
}

export function getOrgRates(org: OrgRateInputs): OrgRates {
  return {
    baseFeeCents:     org.customBaseFeeCents     ?? DEFAULT_BASE_FEE_CENTS,
    memorialFeeCents: org.customMemorialFeeCents ?? DEFAULT_MEMORIAL_FEE_CENTS,
    videoFeeCents:    DEFAULT_VIDEO_FEE_CENTS,
  };
}

export function listFeeForEvent(type: UsageEventType, rates: OrgRates): number {
  switch (type) {
    case 'MEMORIAL_CREATED':        return rates.memorialFeeCents;
    case 'TRIBUTE_VIDEO_RENDERED':  return rates.videoFeeCents;
  }
}

/** True while the org's free trial is still running at instant `at`. */
export function isInTrial(trialEndsAt: Date | null | undefined, at: Date): boolean {
  return !!trialEndsAt && at.getTime() < trialEndsAt.getTime();
}

/**
 * The price to freeze onto a usage event at the moment it happens.
 * During the trial everything is tracked but charged at 0.
 */
export function priceForEvent(
  type: UsageEventType,
  rates: OrgRates,
  trialEndsAt: Date | null | undefined,
  at: Date,
): { unitPriceCents: number; note: string | null } {
  const list = listFeeForEvent(type, rates);
  if (list > 0 && isInTrial(trialEndsAt, at)) {
    return { unitPriceCents: 0, note: 'Free trial — not charged' };
  }
  return { unitPriceCents: list, note: list === 0 ? 'No charge' : null };
}

/**
 * Whether a statement for the period ending at `periodEnd` carries the
 * monthly base fee. Rule: the trial must have ended before the period
 * closes. (A site whose trial ends mid-month pays that whole month's base
 * fee; a site still in trial at month end pays none.)
 */
export function baseFeeApplies(
  trialEndsAt: Date | null | undefined,
  periodEnd: Date,
  suspended: boolean,
): boolean {
  if (suspended) return false;
  if (!trialEndsAt) return true;
  return trialEndsAt.getTime() < periodEnd.getTime();
}

export function formatMoney(cents: number, currency: string = CURRENCY): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100);
}

export const EVENT_LABELS: Record<UsageEventType, string> = {
  MEMORIAL_CREATED:       'Memorial created',
  TRIBUTE_VIDEO_RENDERED: 'Tribute video rendered',
};
