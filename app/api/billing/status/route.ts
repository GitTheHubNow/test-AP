/**
 * GET /api/billing/status
 *
 * A site's billing summary: account standing, rates, trial, how to pay, and
 * the running total for the current billing month. Any org member may read
 * this (it drives the dashboard banner); per-memorial detail is in
 * /api/billing/usage and past bills in /api/billing/statements.
 */

import { NextResponse } from 'next/server';
import { withBillingOrg } from '@/lib/billing/routeHelpers';
import { getOrgRates, baseFeeApplies, isInTrial, CURRENCY } from '@/lib/billing/pricing';
import { getPeriodUsage } from '@/lib/billing/usage';
import { periodBounds, periodKeyFor } from '@/lib/billing/period';
import { getPaymentInstructions } from '@/lib/billing/statements';

export async function GET() {
  return withBillingOrg('GET /api/billing/status', async (org) => {
    const now      = new Date();
    const period   = periodKeyFor(now);
    const rates    = getOrgRates(org);
    const usage    = await getPeriodUsage(org.id, period);
    const { end }  = periodBounds(period);
    const baseFee  = baseFeeApplies(org.trialEndsAt, end, org.subscriptionStatus === 'CANCELED') ? rates.baseFeeCents : 0;

    return NextResponse.json({
      success: true,
      data: {
        accountStatus: org.subscriptionStatus, // ACTIVE | PAST_DUE | CANCELED (= suspended)
        currency:      CURRENCY,
        trialEndsAt:   org.trialEndsAt?.toISOString() ?? null,
        inTrial:       isInTrial(org.trialEndsAt, now),
        rates: {
          baseFeeCents:     rates.baseFeeCents,
          memorialFeeCents: rates.memorialFeeCents,
        },
        paymentInstructions: getPaymentInstructions() || null,
        currentPeriod: {
          periodKey:           period,
          memorialCount:       usage.totals.memorialCount,
          videoCount:          usage.totals.videoCount,
          usageCents:          usage.totals.usageCents,
          baseFeeCents:        baseFee,
          estimatedTotalCents: baseFee + usage.totals.usageCents,
        },
      },
    });
  }, { anyMember: true });
}
