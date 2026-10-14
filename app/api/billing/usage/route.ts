/**
 * GET /api/billing/usage?period=YYYY-MM
 *
 * Per-memorial usage for the caller's site: exactly which memorials were
 * billed, when, and at what price. Defaults to the current month.
 * OWNER/ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withBillingOrg, readPeriodParam } from '@/lib/billing/routeHelpers';
import { getPeriodUsage } from '@/lib/billing/usage';

export async function GET(req: NextRequest) {
  const p = readPeriodParam(req.url);
  if ('error' in p) return p.error;

  return withBillingOrg('GET /api/billing/usage', async (org) => {
    const data = await getPeriodUsage(org.id, p.period);
    return NextResponse.json({ success: true, data });
  });
}
