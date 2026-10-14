/**
 * lib/entitlement.ts
 *
 * Account-standing gate for manual (invoice-based) billing.
 *
 * Creating a memorial is never quantity-capped — every memorial is simply
 * recorded in the usage ledger (lib/billing/usage.ts) and billed on the
 * site's monthly statement. The only thing that can stop a site creating
 * memorials is the platform admin SUSPENDING the account (for example for
 * non-payment), which sets Organisation.subscriptionStatus = 'CANCELED'
 * via PATCH /api/system/billing/orgs/[orgId].
 *
 * ACTIVE and PAST_DUE are both allowed — PAST_DUE is a grace state the
 * admin can use to flag an overdue site without cutting it off.
 *
 * Usage:
 *   const check = await checkAccountActive(orgId);
 *   if (!check.allowed) return entitlementError(check.reason!);
 */

import { prisma }       from '@/lib/prisma';
import { NextResponse } from 'next/server';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
}

export async function checkAccountActive(orgId: string): Promise<EntitlementResult> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { subscriptionStatus: true },
  });

  if (!org) {
    return { allowed: false, reason: 'Organisation not found' };
  }

  if (org.subscriptionStatus === 'CANCELED') {
    return {
      allowed: false,
      reason:  'This account has been suspended. Please contact support to reactivate it before creating new memorials.',
    };
  }

  return { allowed: true };
}

/**
 * Standard response for a blocked account.
 * Use in routes: if (!check.allowed) return entitlementError(check.reason!);
 */
export function entitlementError(reason: string): NextResponse {
  return NextResponse.json(
    { success: false, error: reason, code: 'ACCOUNT_SUSPENDED' },
    { status: 403 },
  );
}
