// app/api/cron/unlock-memorials/route.ts
//
// Vercel Cron Job — runs every 5 minutes.
// Finds all memorials with qrState = UNLOCK_PENDING where unlockAt has passed,
// and transitions them to MEMORIAL_OPEN.
//
// Registered in vercel.json:
// {
//   "crons": [{ "path": "/api/cron/unlock-memorials", "schedule": "*/5 * * * *" }]
// }
//
// Security:
//   Not in Clerk protected routes — correct by design.
//   Protected by CRON_SECRET header check.
//   Vercel sends secret as Authorization: Bearer [secret] in production.
//   For local testing: send as x-cron-secret header.
//
// CRON_SECRET must be set in .env.local:
//   Generate with: openssl rand -hex 32

import { NextRequest }  from 'next/server';
import { prisma }       from '@/lib/prisma';
import { autoUnlockWhere } from '@/lib/qr/lifecycle';
import { logInfo, logError } from '@/lib/errors';
import { isValidCronSecret } from '@/lib/timingSafe';

export async function GET(req: NextRequest) {
  // Accept secret via Vercel's Authorization header or x-cron-secret (local testing)
  const authHeader = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-cron-secret');

  const provided =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) :
    cronHeader ?? null;

  if (!process.env.CRON_SECRET) {
    logError('cron/unlock-memorials', 'CRON_SECRET env variable is not set');
    return Response.json({ error: 'Cron not configured' }, { status: 500 });
  }

  // Constant-time comparison (see lib/cronAuth.ts) — was a plain !==
  // string comparison, a low-severity timing side channel.
  if (!isValidCronSecret(provided)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const where = autoUnlockWhere();

    // Count first so we can log meaningfully
    const pending = await prisma.memorial.count({ where });

    if (pending === 0) {
      logInfo('cron/unlock-memorials', 'No memorials to unlock');
      return Response.json({ unlocked: 0, message: 'Nothing to do' });
    }

    const result = await prisma.memorial.updateMany({
      where,
      data: { qrState: 'MEMORIAL_OPEN' },
    });

    logInfo('cron/unlock-memorials', `Unlocked ${result.count} memorial(s)`, {
      count: result.count,
    });

    return Response.json({
      unlocked: result.count,
      message:  `Unlocked ${result.count} memorial(s)`,
    });

  } catch (err) {
    logError('cron/unlock-memorials', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
