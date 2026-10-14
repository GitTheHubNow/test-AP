/**
 * PATCH /api/system/billing/orgs/[orgId]   (platform admin only)
 *
 * Per-site billing settings. All fields optional; send null to clear.
 *   billingEmail            — where statements go (null = the site's owners)
 *   customBaseFeeCents      — negotiated monthly fee (null = platform default)
 *   customMemorialFeeCents  — negotiated per-memorial fee (null = default)
 *   accountStatus           — ACTIVE | PAST_DUE (overdue, still allowed) |
 *                             CANCELED (suspended: cannot create memorials)
 *
 * New rates apply to usage recorded AFTER the change — already-recorded
 * events keep the price they were frozen at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/billing/routeHelpers';

const MAX_CENTS = 10_000_00;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;

  return withPlatformAdmin('PATCH /api/system/billing/orgs/[orgId]', async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if ('billingEmail' in b) {
      if (b.billingEmail !== null && !(typeof b.billingEmail === 'string' && EMAIL_RE.test(b.billingEmail.trim()))) {
        return bad('billingEmail must be a valid email or null');
      }
      data.billingEmail = b.billingEmail === null ? null : (b.billingEmail as string).trim();
    }
    for (const f of ['customBaseFeeCents', 'customMemorialFeeCents'] as const) {
      if (f in b) {
        const v = b[f];
        if (v !== null && !(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_CENTS)) {
          return bad(`${f} must be a whole number of cents between 0 and ${MAX_CENTS}, or null`);
        }
        data[f] = v;
      }
    }
    if ('accountStatus' in b) {
      if (b.accountStatus !== 'ACTIVE' && b.accountStatus !== 'PAST_DUE' && b.accountStatus !== 'CANCELED') {
        return bad('accountStatus must be ACTIVE, PAST_DUE or CANCELED');
      }
      data.subscriptionStatus = b.accountStatus;
    }
    if (Object.keys(data).length === 0) return bad('Nothing to update');

    const exists = await prisma.organisation.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!exists) return NextResponse.json({ success: false, error: 'Site not found' }, { status: 404 });

    const o = await prisma.organisation.update({
      where: { id: orgId }, data,
      select: { id: true, billingEmail: true, customBaseFeeCents: true, customMemorialFeeCents: true, subscriptionStatus: true },
    });
    return NextResponse.json({ success: true, data: { ...o, accountStatus: o.subscriptionStatus } });
  });
}
