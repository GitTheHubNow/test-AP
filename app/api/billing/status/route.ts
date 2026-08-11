/**
 * GET /api/billing/status
 *
 * Returns the current org's plan, subscription status, and usage.
 * Used by the billing dashboard page and the nav to show upgrade prompts.
 *
 * Response shape:
 * {
 *   plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
 *   subscriptionStatus: 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE'
 *   currentPeriodEnd: string | null
 *   cancelAtPeriodEnd: boolean
 *   trialEndsAt: string | null
 *   usage: {
 *     memorialsThisMonth: number
 *     videosThisMonth: number
 *     memorialLimit: number   (-1 = unlimited)
 *     videoLimit: number      (-1 = unlimited)
 *   }
 *   features: {
 *     guestBook: boolean
 *     analytics: boolean
 *     customBranding: boolean
 *     apiAccess: boolean
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { getOrgForUser }              from '@/lib/tenant';
import { getUsage }                   from '@/lib/entitlement';
import { PLAN_LIMITS, PLAN_DISPLAY }  from '@/lib/stripe';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const org   = await getOrgForUser(userId);
    const usage = await getUsage(org.id);
    const limits = PLAN_LIMITS[usage.plan];

    return NextResponse.json({
      success: true,
      data: {
        plan:               usage.plan,
        planDisplay:        PLAN_DISPLAY[usage.plan],
        subscriptionStatus: org.subscriptionStatus,
        currentPeriodEnd:   org.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd:  org.cancelAtPeriodEnd,
        trialEndsAt:        org.trialEndsAt?.toISOString() ?? null,
        usage: {
          memorialsThisMonth: usage.memorialsThisMonth,
          videosThisMonth:    usage.videosThisMonth,
          memorialLimit:      usage.memorialLimit,
          videoLimit:         usage.videoLimit,
        },
        features: {
          guestBook:      limits.guestBook,
          analytics:      limits.analytics,
          customBranding: limits.customBranding,
          apiAccess:      limits.apiAccess,
        },
      },
    });

  } catch (error) {
    console.error('[GET /api/billing/status]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch billing status' }, { status: 500 });
  }
}
