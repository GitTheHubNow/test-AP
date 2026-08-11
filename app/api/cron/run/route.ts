import { NextRequest, NextResponse } from 'next/server';
import { runSendAfterDaysJob }  from '@/lib/jobs/job-send-after-days';
import { runExpiryWarningJob }  from '@/lib/jobs/job-expiry-warning';
import { runExpiryEnforceJob }  from '@/lib/jobs/job-expiry-enforce';
import { runStaleMemoriesJob }  from '@/lib/jobs/job-stale-memories';

/**
 * POST /api/cron/run
 *
 * Orchestrates all Phase 10 automation jobs.
 * Protected by CRON_SECRET header — must match env var.
 *
 * Schedule this endpoint externally:
 * - Vercel Cron: add to vercel.json (see below)
 * - Railway / Render / any cron service: POST every hour
 *
 * vercel.json example:
 * {
 *   "crons": [{ "path": "/api/cron/run", "schedule": "0 * * * *" }]
 * }
 *
 * Required env var: CRON_SECRET=<long random string>
 * Set the same value in your cron service's Authorization header:
 * Authorization: Bearer <CRON_SECRET>
 *
 * Phase 10
 */
export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('[cron] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token      = authHeader?.replace('Bearer ', '').trim();

  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Run jobs ────────────────────────────────────────────────────────────
  const startedAt = new Date();
  console.log(`[cron] Starting job run at ${startedAt.toISOString()}`);

  const results: Record<string, unknown> = {};

  // Job 1: Send after days
  try {
    results.sendAfterDays = await runSendAfterDaysJob();
    console.log('[cron] sendAfterDays complete:', results.sendAfterDays);
  } catch (err) {
    results.sendAfterDays = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] sendAfterDays failed:', err);
  }

  // Job 2: Expiry warning (5 years out)
  try {
    results.expiryWarning = await runExpiryWarningJob();
    console.log('[cron] expiryWarning complete:', results.expiryWarning);
  } catch (err) {
    results.expiryWarning = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] expiryWarning failed:', err);
  }

  // Job 3: Expiry enforcement
  try {
    results.expiryEnforce = await runExpiryEnforceJob();
    console.log('[cron] expiryEnforce complete:', results.expiryEnforce);
  } catch (err) {
    results.expiryEnforce = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] expiryEnforce failed:', err);
  }

  // Job 4: Stale memory flagging
  try {
    results.staleMemories = await runStaleMemoriesJob();
    console.log('[cron] staleMemories complete:', results.staleMemories);
  } catch (err) {
    results.staleMemories = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] staleMemories failed:', err);
  }

  const finishedAt  = new Date();
  const durationMs  = finishedAt.getTime() - startedAt.getTime();

  console.log(`[cron] All jobs complete in ${durationMs}ms`);

  return NextResponse.json({
    success:    true,
    startedAt:  startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    results,
  });
}

// Also support GET for Vercel Cron (which sends GET by default)
export async function GET(request: NextRequest) {
  return POST(request);
}
