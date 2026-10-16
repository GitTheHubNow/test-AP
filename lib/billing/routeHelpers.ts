// lib/billing/routeHelpers.ts — shared guards for the billing API routes.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { assertPlatformAdmin } from '@/lib/auth/platformAdmin';
import { prisma } from '@/lib/prisma';
import { isValidPeriodKey, periodKeyFor } from '@/lib/billing/period';

const json = (body: Record<string, unknown>, status: number) => NextResponse.json({ success: false, ...body }, { status });

/** Run a platform-admin-only handler with uniform 401/403/500 handling. */
export async function withPlatformAdmin(
  label: string,
  handler: (userId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) return json({ error: 'Unauthorised' }, 401);
    assertPlatformAdmin(userId);
    return await handler(userId);
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      return json({ error: err instanceof Error ? err.message : 'Access denied' }, (err as { status: number }).status);
    }
    console.error(`[${label}]`, err);
    return json({ error: 'Internal error' }, 500);
  }
}

type MemberOrg = NonNullable<Awaited<ReturnType<typeof findMemberOrg>>>;

/**
 * READ-ONLY org lookup. Deliberately NOT lib/tenant's getOrgForUser, which
 * silently creates a "My Funeral Home" organisation for any user without one
 * — a side effect a billing GET must never have (it would let an API call
 * skip onboarding, and two simultaneous first calls collide on the unique
 * clerkOrgId and 500).
 */
async function findMemberOrg(userId: string) {
  const m = await prisma.orgMember.findFirst({
    where: { userId }, include: { organisation: true }, orderBy: { createdAt: 'asc' },
  });
  return m ? { ...m.organisation, role: m.role } : null;
}

/** Run a handler for an authenticated OWNER/ADMIN of a site; passes the site's org. */
export async function withBillingOrg(
  label: string,
  handler: (org: MemberOrg) => Promise<NextResponse>,
  opts: { anyMember?: boolean } = {},
): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) return json({ error: 'Unauthorised' }, 401);
    const org = await findMemberOrg(userId);
    if (!org) return json({ error: 'No organisation found for this account' }, 404);
    if (!opts.anyMember && org.role !== 'OWNER' && org.role !== 'ADMIN') {
      return json({ error: 'Only an account owner or admin can view billing details' }, 403);
    }
    return await handler(org);
  } catch (err) {
    console.error(`[${label}]`, err);
    return json({ error: 'Failed to load billing information' }, 500);
  }
}

/** Reads ?period=YYYY-MM, defaulting to the current billing month. Returns a 400 response if malformed. */
export function readPeriodParam(url: string): { period: string } | { error: NextResponse } {
  const raw = new URL(url).searchParams.get('period');
  if (raw === null) return { period: periodKeyFor(new Date()) };
  if (!isValidPeriodKey(raw)) return { error: json({ error: 'period must be YYYY-MM, e.g. 2026-09' }, 400) };
  return { period: raw };
}
