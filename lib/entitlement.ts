/**
 * lib/entitlement.ts
 *
 * CHANGED — was plan-tier limit enforcement (blocked memorial/video
 * creation once a tier's monthly cap was hit). Under the new base +
 * per-memorial-metered pricing model (see lib/stripe.ts), there is no
 * cap to enforce — creating a memorial is never blocked, it's simply
 * billed. This file now exists to:
 *   1. Track usage counts for dashboard display (getUsage)
 *   2. Gate subscription-status-dependent access (checkSubscriptionActive) —
 *      e.g. a CANCELED org shouldn't be creating new memorials even
 *      though there's no per-tier cap anymore
 *   3. checkFeature() — every feature is available to every org with an
 *      active subscription now (no more tier-gated features), so this
 *      just checks subscription status, not a feature flag lookup
 *
 * Usage:
 *   const check = await checkSubscriptionActive(orgId);
 *   if (!check.allowed) return entitlementError(check.reason!);
 *   // ... create the memorial ...
 *   await incrementUsage(orgId, 'memorialsThisMonth');
 *   await reportMemorialUsageToStripe(orgId); // see lib/memorial/createMemorial.ts
 */

import { prisma }       from '@/lib/prisma';
import { NextResponse } from 'next/server';
import type { OrgPlan } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────────────

type Counter = 'memorialsThisMonth' | 'videosThisMonth';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
}

// ── Core check ───────────────────────────────────────────────────────────────

/**
 * Check whether an org's subscription is in a state that allows creating
 * new resources. Replaces the old per-tier checkEntitlement() —
 * memorial/video creation is never quantity-capped anymore, only
 * gated on the subscription actually being active (or trialing).
 */
export async function checkSubscriptionActive(orgId: string): Promise<EntitlementResult> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });

  if (!org) {
    return { allowed: false, reason: 'Organisation not found' };
  }

  // ACTIVE covers both a paid subscription and Stripe's 'trialing' status
  // (mapped to ACTIVE in the webhook handler — see applySubscriptionToOrg
  // in app/api/billing/webhook/route.ts).
  if (org.subscriptionStatus === 'ACTIVE') {
    return { allowed: true };
  }

  // PAST_DUE — grace period, still allowed but the org should see a
  // billing warning elsewhere in the UI (not this function's job).
  if (org.subscriptionStatus === 'PAST_DUE') {
    return { allowed: true };
  }

  if (org.subscriptionStatus === 'CANCELED') {
    return { allowed: false, reason: 'Your subscription has been cancelled. Reactivate billing to create new memorials.' };
  }

  if (org.subscriptionStatus === 'INCOMPLETE') {
    return { allowed: false, reason: 'Your payment method needs attention before you can create new memorials.' };
  }

  // NONE — never completed checkout at all.
  return { allowed: false, reason: 'Add a payment method to start creating memorials.' };
}

/**
 * Was plan-tier feature gating (guestBook/analytics/customBranding/
 * apiAccess were PROFESSIONAL/ENTERPRISE-only). Every paying org now
 * gets every feature under the single-plan model — this just checks
 * the subscription is active, same as checkSubscriptionActive above.
 * Kept as a separate named function since callers already exist and
 * the intent ("can this org use this feature") is still clear at each
 * call site even though the underlying check simplified.
 */
export async function checkFeature(orgId: string): Promise<{ allowed: boolean }> {
  const result = await checkSubscriptionActive(orgId);
  return { allowed: result.allowed };
}

// ── Usage tracking ───────────────────────────────────────────────────────────

/**
 * Increment a monthly usage counter after successful resource creation.
 * Call this AFTER the resource is created, not before.
 *
 * Still used for dashboard display (getUsage) — memorialsThisMonth is
 * ALSO now the quantity reported to Stripe as metered usage, see
 * reportMemorialUsageToStripe in lib/memorial/createMemorial.ts, which
 * is a separate call — this function only updates the local counter,
 * it does not talk to Stripe.
 */
export async function incrementUsage(orgId: string, counter: Counter): Promise<void> {
  await prisma.organisation.update({
    where: { id: orgId },
    data:  { [counter]: { increment: 1 } },
  });
}

/**
 * Get current usage for an org (for dashboard display).
 * No more limit/cap fields — there's nothing to cap under metered
 * billing, this is purely informational ("you've created N memorials
 * this month, which will show as $X on your next invoice").
 */
export async function getUsage(orgId: string): Promise<{
  plan:               OrgPlan; // kept for display only, not meaningful — see lib/stripe.ts header comment
  memorialsThisMonth: number;
  videosThisMonth:    number;
  estimatedMemorialChargeAud: number;
}> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { plan: true, memorialsThisMonth: true, videosThisMonth: true },
  });

  if (!org) throw new Error('Organisation not found');

  return {
    plan:               org.plan,
    memorialsThisMonth: org.memorialsThisMonth,
    videosThisMonth:    org.videosThisMonth,
    estimatedMemorialChargeAud: org.memorialsThisMonth * 199,
  };
}

// ── Response helper ──────────────────────────────────────────────────────────

/**
 * Standard 402 response for entitlement failures.
 * Use this in routes: if (!check.allowed) return entitlementError(check.reason!);
 */
export function entitlementError(reason: string): NextResponse {
  return NextResponse.json(
    { success: false, error: reason, code: 'SUBSCRIPTION_INACTIVE' },
    { status: 402 }  // 402 Payment Required
  );
}
