/**
 * GET /api/system/billing/usage?period=YYYY-MM   (platform admin only)
 *
 * Every site's usage and billing state for one month — the overview you
 * work from at month end: who created how many memorials, what they owe,
 * and whether their statement is drafted / sent / paid.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin, readPeriodParam } from '@/lib/billing/routeHelpers';
import { getPlatformUsage } from '@/lib/billing/usage';
import { getOrgRates } from '@/lib/billing/pricing';

export async function GET(req: NextRequest) {
  const p = readPeriodParam(req.url);
  if ('error' in p) return p.error;

  return withPlatformAdmin('GET /api/system/billing/usage', async () => {
    const [usage, statements, orgs] = await Promise.all([
      getPlatformUsage(p.period),
      prisma.billingStatement.findMany({ where: { periodKey: p.period } }),
      prisma.organisation.findMany({
        select: {
          id: true, name: true, brandName: true, subscriptionStatus: true, trialEndsAt: true,
          billingEmail: true, customBaseFeeCents: true, customMemorialFeeCents: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const usageByOrg = new Map(usage.map((u) => [u.organisationId, u]));
    const stmtByOrg  = new Map(statements.map((s) => [s.organisationId, s]));

    const sites = orgs.map((o) => {
      const u = usageByOrg.get(o.id);
      const s = stmtByOrg.get(o.id);
      const rates = getOrgRates(o);
      return {
        organisationId: o.id,
        name:           o.brandName ?? o.name,
        accountStatus:  o.subscriptionStatus,
        trialEndsAt:    o.trialEndsAt?.toISOString() ?? null,
        billingEmail:   o.billingEmail,
        customBaseFeeCents:     o.customBaseFeeCents,
        customMemorialFeeCents: o.customMemorialFeeCents,
        baseFeeCents:           rates.baseFeeCents,
        memorialFeeCents:       rates.memorialFeeCents,
        memorialCount:  u?.memorialCount ?? 0,
        videoCount:     u?.videoCount ?? 0,
        usageCents:     u?.usageCents ?? 0,
        statement: s ? { id: s.id, number: s.number, status: s.status, totalCents: s.totalCents } : null,
      };
    });

    return NextResponse.json({ success: true, data: { period: p.period, sites } });
  });
}
