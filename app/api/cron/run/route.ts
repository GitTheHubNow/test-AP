import { NextRequest, NextResponse } from 'next/server';
import { runSendAfterDaysJob }  from '@/lib/jobs/job-send-after-days';
import { runExpiryWarningJob }  from '@/lib/jobs/job-expiry-warning';
import { runExpiryEnforceJob }  from '@/lib/jobs/job-expiry-enforce';
import { runStaleMemoriesJob }  from '@/lib/jobs/job-stale-memories';
import { runLastChanceUploadJob, runPublishPromptJob } from '@/lib/jobs/job-journey-automation';
import { runAutoHandoverJob } from '@/lib/jobs/job-auto-handover';
import { isValidCronSecret } from '@/lib/timingSafe';

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
  if (!process.env.CRON_SECRET) {
    console.error('[cron] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token      = authHeader?.replace('Bearer ', '').trim();

  // Constant-time comparison (see lib/cronAuth.ts) — was a plain !==
  // string comparison, which is a (low-severity, but free-to-fix)
  // timing side channel on a bearer-token check.
  if (!isValidCronSecret(token)) {
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

  // Job 5: Last chance to upload — ~5 days before the service, to family
  try {
    results.lastChanceUpload = await runLastChanceUploadJob();
    console.log('[cron] lastChanceUpload complete:', results.lastChanceUpload);
  } catch (err) {
    results.lastChanceUpload = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] lastChanceUpload failed:', err);
  }

  // Job 6: Ready to publish — day before the service, to funeral home staff
  try {
    results.publishPrompt = await runPublishPromptJob();
    console.log('[cron] publishPrompt complete:', results.publishPrompt);
  } catch (err) {
    results.publishPrompt = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] publishPrompt failed:', err);
  }

  // Job 7: Auto-initiate handover — X days after the service, invites the
  // family on file to accept ownership (they must still click to accept —
  // see lib/jobs/job-auto-handover.ts for why this stays a click, not a
  // silent transfer)
  try {
    results.autoHandover = await runAutoHandoverJob();
    console.log('[cron] autoHandover complete:', results.autoHandover);
  } catch (err) {
    results.autoHandover = { error: err instanceof Error ? err.message : String(err) };
    console.error('[cron] autoHandover failed:', err);
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
