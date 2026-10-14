/**
 * POST /api/system/billing/statements/send-all   (platform admin only)
 * Body: { period: 'YYYY-MM' }
 *
 * Emails every DRAFT statement for the month in one go. Statements that
 * fail (no recipient, email error) stay DRAFT and are listed in the
 * response so they can be fixed and retried — re-running only touches
 * the remaining drafts, never re-sends ones already SENT.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/billing/routeHelpers';
import { isValidPeriodKey } from '@/lib/billing/period';
import { sendAllDrafts } from '@/lib/billing/statements';

export async function POST(req: NextRequest) {
  return withPlatformAdmin('POST /api/system/billing/statements/send-all', async () => {
    const body = (await req.json().catch(() => ({}))) as { period?: unknown };
    if (!isValidPeriodKey(body.period)) {
      return NextResponse.json({ success: false, error: 'period must be YYYY-MM, e.g. 2026-09' }, { status: 400 });
    }
    const rows = await sendAllDrafts(body.period);
    const failed = rows.filter((r) => !r.ok);
    return NextResponse.json({
      success: true,
      data: { sent: rows.length - failed.length, failed: failed.length, failures: failed },
    });
  });
}
