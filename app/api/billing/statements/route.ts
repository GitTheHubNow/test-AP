/**
 * GET /api/billing/statements
 *
 * The caller's site's bills, newest first. DRAFT statements are hidden —
 * a site only sees a bill once it has actually been sent to them.
 * OWNER/ADMIN only.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withBillingOrg } from '@/lib/billing/routeHelpers';
import { toStatementDTO } from '@/lib/billing/statements';

export async function GET() {
  return withBillingOrg('GET /api/billing/statements', async (org) => {
    const rows = await prisma.billingStatement.findMany({
      where:   { organisationId: org.id, status: { in: ['SENT', 'PAID'] } },
      orderBy: { periodStart: 'desc' },
      take:    36,
    });
    return NextResponse.json({ success: true, data: { statements: rows.map(toStatementDTO) } });
  });
}
