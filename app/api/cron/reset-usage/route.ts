/**
 * GET /api/cron/reset-usage
 *
 * Resets monthly usage counters for all organisations.
 * Run on the 1st of every month at midnight UTC.
 *
 * Add to vercel.json:
 *   "crons": [{ "path": "/api/cron/reset-usage", "schedule": "0 0 1 * *" }]
 *
 * Protected by CRON_SECRET. Vercel Cron sends it as
 * "Authorization: Bearer <secret>" in production — the previous version
 * of this file only checked x-cron-secret, which Vercel never actually
 * sends, so real scheduled calls would have been rejected as 403 even
 * once added to vercel.json. Fixed to accept both, same as
 * unlock-memorials/route.ts.
 * For manual testing: curl -H "x-cron-secret: YOUR_SECRET" https://yourapp.com/api/cron/reset-usage
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma }                     from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronHeader  = req.headers.get('x-cron-secret');

  const provided =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) :
    cronHeader ?? null;

  if (!process.env.CRON_SECRET) {
    console.error('[cron/reset-usage] CRON_SECRET env variable is not set');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }

  if (provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await prisma.organisation.updateMany({
      data: {
        memorialsThisMonth: 0,
        videosThisMonth:    0,
      },
    });

    console.log(`[cron/reset-usage] Reset counters for ${result.count} organisations`);

    return NextResponse.json({
      success: true,
      reset:   new Date().toISOString(),
      count:   result.count,
    });

  } catch (error) {
    console.error('[cron/reset-usage]', error);
    return NextResponse.json({ success: false, error: 'Reset failed' }, { status: 500 });
  }
}
