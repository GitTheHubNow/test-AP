/**
 * GET /api/billing/status
 *
 * Returns the current org's subscription status and usage/billing
 * estimate.
 *
 * CHANGED — was plan-tier + limits + feature-flags. Under the base +
 * per-memorial-metered model there's one plan for everyone, no limits
 * to hit, and every feature is available to any org with an active
 * subscription — so `plan`, `limits`, and `features` are gone from this
 * response. Replaced with a running total of what this month's usage
 * will actually cost.
 *
 * Response shape:
 * {
 *   subscriptionStatus: 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE'
 *   currentPeriodEnd: string | null
 *   cancelAtPeriodEnd: boolean
 *   trialEndsAt: string | null
 *   billing: {
 *     baseFeeAud: number
 *     perMemorialAud: number
 *   }
 *   usage: {
 *     memorialsThisMonth: number
 *     videosThisMonth: number
 *     estimatedMemorialChargeAud: number
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { getOrgForUser }              from '@/lib/tenant';
import { getUsage }                   from '@/lib/entitlement';
import { BILLING_DISPLAY }            from '@/lib/stripe';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const org   = await getOrgForUser(userId);
    const usage = await getUsage(org.id);

    return NextResponse.json({
      success: true,
      data: {
        subscriptionStatus: org.subscriptionStatus,
        currentPeriodEnd:   org.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd:  org.cancelAtPeriodEnd,
        trialEndsAt:        org.trialEndsAt?.toISOString() ?? null,
        billing: {
          baseFeeAud:     BILLING_DISPLAY.baseFeeAud,
          perMemorialAud: BILLING_DISPLAY.perMemorialAud,
        },
        usage: {
          memorialsThisMonth:         usage.memorialsThisMonth,
          videosThisMonth:            usage.videosThisMonth,
          estimatedMemorialChargeAud: usage.estimatedMemorialChargeAud,
        },
      },
    });

  } catch (error) {
    console.error('[GET /api/billing/status]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch billing status' }, { status: 500 });
  }
}
