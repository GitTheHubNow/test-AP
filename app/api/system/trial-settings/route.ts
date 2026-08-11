// app/api/system/trial-settings/route.ts
//
// GET  — read the current trial-length/promo settings.
// PATCH — update them. Both platform-admin only (see
// lib/auth/platformAdmin.ts) — this is a global, platform-wide setting,
// not something any org OWNER should be able to see or touch.
//
// Singleton row (id = "singleton") — created by the migration at
// prisma/migrations/20260809120000_add_platform_settings. GET upserts
// defensively in case that seed row is ever missing (e.g. a fresh DB
// where the migration ran but the seed insert was skipped for some
// reason) so this route never 500s on a missing row.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertPlatformAdmin } from '@/lib/auth/platformAdmin';

const SETTINGS_ID = 'singleton';

export async function GET() {
  try {
    const { userId } = await auth();
    assertPlatformAdmin(userId);

    const settings = await prisma.platformSettings.upsert({
      where:  { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Access denied' },
        { status: (error as { status: number }).status },
      );
    }
    console.error('[GET /api/system/trial-settings]', error);
    return NextResponse.json({ success: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    assertPlatformAdmin(userId);

    const body = await request.json().catch(() => ({}));
    const { trialDays, promoActive, promoLabel } = body as {
      trialDays?: number;
      promoActive?: boolean;
      promoLabel?: string | null;
    };

    // Validate trialDays if provided — must be a sane positive integer.
    // Upper bound of 365 is a sanity guard, not a real business limit;
    // raise it here if you ever genuinely need a longer trial.
    if (trialDays !== undefined) {
      if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
        return NextResponse.json(
          { success: false, error: 'trialDays must be an integer between 0 and 365' },
          { status: 400 },
        );
      }
    }

    const settings = await prisma.platformSettings.upsert({
      where:  { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        ...(trialDays !== undefined ? { trialDays } : {}),
        ...(promoActive !== undefined ? { promoActive } : {}),
        ...(promoLabel !== undefined ? { promoLabel } : {}),
        updatedByUserId: userId,
      },
      update: {
        ...(trialDays !== undefined ? { trialDays } : {}),
        ...(promoActive !== undefined ? { promoActive } : {}),
        ...(promoLabel !== undefined ? { promoLabel } : {}),
        updatedByUserId: userId,
      },
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Access denied' },
        { status: (error as { status: number }).status },
      );
    }
    console.error('[PATCH /api/system/trial-settings]', error);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
