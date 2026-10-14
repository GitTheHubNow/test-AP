/**
 * GET /api/cron/billing
 *
 * Runs on the 1st of each month (see vercel.json). Generates DRAFT
 * statements for the month that just ended, for every site. By default it
 * does NOT email them — review at /dashboard/system/billing and send when
 * happy. Set BILLING_AUTO_SEND=true to email each new statement straight
 * away instead. Either way the owner gets a "bills are ready" email, and a
 * banner shows on the dashboard until every draft is sent.
 *
 * Replaces /api/cron/reset-usage: there are no monthly counters to reset
 * any more, the usage ledger is the source of truth.
 *
 * Protected by CRON_SECRET (Authorization: Bearer … from Vercel Cron, or
 * x-cron-secret for manual runs). Safe to run twice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidCronSecret } from '@/lib/timingSafe';
import { generateAllStatements, sendStatement, isAutoSendEnabled } from '@/lib/billing/statements';
import { periodKeyFor, previousPeriodKey } from '@/lib/billing/period';
import { getReviewSummary } from '@/lib/billing/adminSummary';
import { notifyAdminBillsReady } from '@/lib/billing/adminNotify';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.headers.get('x-cron-secret');

  if (!process.env.CRON_SECRET) {
    console.error('[cron/billing] CRON_SECRET env variable is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  if (!isValidCronSecret(provided)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const period  = previousPeriodKey(periodKeyFor(new Date()));
    const results = await generateAllStatements(period);

    let sent = 0, sendFailed = 0;
    if (isAutoSendEnabled()) {
      for (const r of results) {
        if ((r.outcome === 'created' || r.outcome === 'regenerated') && r.statementId) {
          const s = await sendStatement(r.statementId);
          if (s.ok) sent++; else { sendFailed++; console.error(`[cron/billing] send failed for ${r.statementId}: ${s.error}`); }
        }
      }
    }

    // Heads-up email to the owner: drafts still waiting for review (all of
    // them, if auto-send is off). A failed email never fails the run.
    let notified = 0;
    try {
      notified = (await notifyAdminBillsReady(await getReviewSummary())).sent;
    } catch (err) {
      console.error('[cron/billing] admin notification failed:', err);
    }

    const count = (o: string) => results.filter((r) => r.outcome === o).length;
    console.log(`[cron/billing] ${period}: created=${count('created')} regenerated=${count('regenerated')} skipped=${count('skipped')} errors=${count('error')} sent=${sent}`);
    return NextResponse.json({
      success: true, period,
      created: count('created'), regenerated: count('regenerated'), skipped: count('skipped'),
      errors: count('error'), sent, sendFailed, notified,
    });
  } catch (error) {
    console.error('[cron/billing]', error);
    return NextResponse.json({ success: false, error: 'Billing run failed' }, { status: 500 });
  }
}
