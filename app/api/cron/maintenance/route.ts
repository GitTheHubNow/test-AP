// app/api/cron/maintenance/route.ts
//
// Vercel Cron Job — runs daily.
// Runs the JobExecutor system from lib/jobs/index.ts, which existed fully
// built but was never connected to any real trigger — see lib/cron/scheduler.ts,
// which defined intended schedules but nothing ever called it. This route
// is the actual missing connection, added during the pre-launch audit.
//
// Runs 3 of the 4 defined jobs, in order:
//   1. INTEGRITY_CHECK — read-only, verifies sealed content hasn't been
//      tampered with. Flags issues via audit log, changes nothing.
//   2. AUDIT_CLEANUP — deletes audit_events rows past their retention
//      period (see lib/retention.ts's policy table — only READ-action
//      events are ever deleted, everything else is kept forever).
//   3. AUTO_SEAL — permanently seals APPROVED memories older than 30
//      days (adds a content hash, locks them from further edits).
//
// COMPLIANCE_EXPORT is deliberately NOT run here — as currently written
// it only counts audit events and returns a number nobody sees (no email,
// no file). Not worth running until it actually produces something.
// See JobType.COMPLIANCE_EXPORT in lib/jobs/index.ts if building this out.
//
// Registered in vercel.json:
// {
//   "crons": [{ "path": "/api/cron/maintenance", "schedule": "0 18 * * *" }]
// }
//
// Security: same CRON_SECRET pattern as every other route in app/api/cron/*
// — see unlock-memorials/route.ts for the canonical version of this check.

import { NextRequest } from 'next/server';
import { JobExecutor, JobType } from '@/lib/jobs';
import { logInfo, logError } from '@/lib/errors';
import { isValidCronSecret } from '@/lib/timingSafe';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronHeader  = req.headers.get('x-cron-secret');

  const provided =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) :
    cronHeader ?? null;

  if (!process.env.CRON_SECRET) {
    logError('cron/maintenance', 'CRON_SECRET env variable is not set');
    return Response.json({ error: 'Cron not configured' }, { status: 500 });
  }

  // Constant-time comparison (see lib/cronAuth.ts) — was a plain !==
  // string comparison, a low-severity timing side channel.
  if (!isValidCronSecret(provided)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const executor = new JobExecutor();
  const jobsToRun = [JobType.INTEGRITY_CHECK, JobType.AUDIT_CLEANUP, JobType.AUTO_SEAL];

  const results: Record<string, unknown> = {};
  let anyFailed = false;

  for (const jobType of jobsToRun) {
    try {
      const result = await executor.executeJob(jobType);
      results[jobType] = result;
      if (!result.success) anyFailed = true;
    } catch (error) {
      // A single job's unexpected throw should not stop the others from
      // running — same principle as the QR-lifecycle cron job, which
      // isolates failures per-memorial rather than per-batch.
      logError(`cron/maintenance/${jobType}`, error);
      results[jobType] = { success: false, error: 'Unexpected error, see server logs' };
      anyFailed = true;
    }
  }

  // Rate-limit bookkeeping: every public hit writes a RateLimitHit row and
  // nothing ever removed them, so the table grew forever (and each request's
  // rank query slowed with it). Longest window in use is 1 hour; keep 24h.
  try {
    const purged = await prisma.rateLimitHit.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    results.RATE_LIMIT_CLEANUP = { success: true, deleted: purged.count };
  } catch (error) {
    logError('cron/maintenance/RATE_LIMIT_CLEANUP', error);
    results.RATE_LIMIT_CLEANUP = { success: false, error: 'Unexpected error, see server logs' };
    anyFailed = true;
  }

  logInfo('cron/maintenance', anyFailed ? 'Completed with failures' : 'Completed successfully', results);

  return Response.json({ success: !anyFailed, results });
}

// Also support GET-only cron trigger with no POST needed — Vercel Cron
// always sends GET, matching every other route in app/api/cron/*.
