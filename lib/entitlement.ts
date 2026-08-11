/**
 * lib/entitlement.ts
 *
 * Plan limit enforcement. Single choke point — all creation routes call
 * checkEntitlement() before inserting. Change limits only in PLAN_LIMITS
 * in lib/stripe.ts.
 *
 * Usage:
 *   const check = await checkEntitlement(orgId, 'memorialsPerMonth');
 *   if (!check.allowed) return entitlementError(check.reason!);
 *   // ... create the memorial ...
 *   await incrementUsage(orgId, 'memorialsThisMonth');
 */

import { prisma }       from '@/lib/prisma';
import { PLAN_LIMITS }  from '@/lib/stripe';
import { NextResponse } from 'next/server';
import type { OrgPlan } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────────────

type Resource = 'memorialsPerMonth' | 'videosPerMonth' | 'seats';
type Counter  = 'memorialsThisMonth' | 'videosThisMonth';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  plan?:   OrgPlan;
  limit?:  number;
  current?: number;
}

// ── Core check ───────────────────────────────────────────────────────────────

/**
 * Check if an org is allowed to create/use a resource.
 * Returns { allowed: true } or { allowed: false, reason: '...' }.
 */
export async function checkEntitlement(
  orgId:    string,
  resource: Resource
): Promise<EntitlementResult> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: {
      plan:               true,
      subscriptionStatus: true,
      memorialsThisMonth: true,
      videosThisMonth:    true,
      trialEndsAt:        true,
      currentPeriodEnd:   true,
    },
  });

  if (!org) {
    return { allowed: false, reason: 'Organisation not found' };
  }

  // Determine effective plan
  // - ACTIVE or NONE (free tier / trial) → use their plan
  // - PAST_DUE → still allowed but flag it (grace period)
  // - CANCELED / INCOMPLETE → downgrade to STARTER limits
  const effectivePlan: OrgPlan =
    org.subscriptionStatus === 'CANCELED' || org.subscriptionStatus === 'INCOMPLETE'
      ? 'STARTER'
      : org.plan;

  const limits  = PLAN_LIMITS[effectivePlan];
  const limit   = limits[resource];

  if (resource === 'memorialsPerMonth') {
    const current = org.memorialsThisMonth;
    if (current >= limit) {
      return {
        allowed: false,
        reason:  `Memorial limit reached. ${effectivePlan} plan allows ${limit} memorials per month (${current} used). Upgrade to create more.`,
        plan:    effectivePlan,
        limit,
        current,
      };
    }
    return { allowed: true, plan: effectivePlan, limit, current };
  }

  if (resource === 'videosPerMonth') {
    const current = org.videosThisMonth;
    if (current >= limit) {
      return {
        allowed: false,
        reason:  `Video limit reached. ${effectivePlan} plan allows ${limit} tribute videos per month (${current} used). Upgrade to create more.`,
        plan:    effectivePlan,
        limit,
        current,
      };
    }
    return { allowed: true, plan: effectivePlan, limit, current };
  }

  return { allowed: true, plan: effectivePlan };
}

/**
 * Check if a plan feature is available (boolean features like guestBook, analytics).
 */
export async function checkFeature(
  orgId:   string,
  feature: keyof typeof PLAN_LIMITS['STARTER']
): Promise<{ allowed: boolean; plan: OrgPlan }> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { plan: true, subscriptionStatus: true },
  });

  if (!org) return { allowed: false, plan: 'STARTER' };

  const effectivePlan: OrgPlan =
    org.subscriptionStatus === 'CANCELED' ? 'STARTER' : org.plan;

  const allowed = Boolean(PLAN_LIMITS[effectivePlan][feature]);
  return { allowed, plan: effectivePlan };
}

// ── Usage tracking ───────────────────────────────────────────────────────────

/**
 * Increment a monthly usage counter after successful resource creation.
 * Call this AFTER the resource is created, not before.
 */
export async function incrementUsage(orgId: string, counter: Counter): Promise<void> {
  await prisma.organisation.update({
    where: { id: orgId },
    data:  { [counter]: { increment: 1 } },
  });
}

/**
 * Get current usage for an org (for dashboard display).
 */
export async function getUsage(orgId: string): Promise<{
  plan:               OrgPlan;
  memorialsThisMonth: number;
  videosThisMonth:    number;
  memorialLimit:      number;
  videoLimit:         number;
}> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { plan: true, subscriptionStatus: true, memorialsThisMonth: true, videosThisMonth: true },
  });

  if (!org) throw new Error('Organisation not found');

  const effectivePlan: OrgPlan =
    org.subscriptionStatus === 'CANCELED' ? 'STARTER' : org.plan;
  const limits = PLAN_LIMITS[effectivePlan];

  return {
    plan:               effectivePlan,
    memorialsThisMonth: org.memorialsThisMonth,
    videosThisMonth:    org.videosThisMonth,
    memorialLimit:      limits.memorialsPerMonth === Infinity ? -1 : limits.memorialsPerMonth,
    videoLimit:         limits.videosPerMonth    === Infinity ? -1 : limits.videosPerMonth,
  };
}

// ── Response helper ──────────────────────────────────────────────────────────

/**
 * Standard 402 response for entitlement failures.
 * Use this in routes: if (!check.allowed) return entitlementError(check.reason!);
 */
export function entitlementError(reason: string): NextResponse {
  return NextResponse.json(
    { success: false, error: reason, code: 'PLAN_LIMIT_REACHED' },
    { status: 402 }  // 402 Payment Required — standard for quota/billing errors
  );
}
