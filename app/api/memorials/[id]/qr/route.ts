// app/api/memorials/[id]/qr/route.ts
//
// GET  — Returns QR code SVG + current lifecycle config for a memorial
// PUT  — Updates QR lifecycle config (state, service time, unlock time, pamphlet)
//
// Protected by: Clerk middleware (/api/memorials/.* is in middleware.ts)
// Feature flag: featureQrLifecycle must be true for the user's org
//
// publicToken is generated lazily on first GET — not at memorial creation.
// This means all existing V1 memorials get a permanent token the first time
// a funeral home opens the QR panel. Safe and non-breaking.
//
// Uses crypto.randomUUID() — available in all Node.js 19+ / Vercel runtimes.
// No nanoid dependency needed.

import { NextRequest }  from 'next/server';
import { auth }         from '@clerk/nextjs/server';
import QRCode           from 'qrcode';
import { prisma }       from '@/lib/prisma';
import {
  assertMemorialAccess,
  assertFeatureEnabled,
}                       from '@/lib/auth/getOrgForUser';
import {
  isValidQRState,
  isValidTransition,
  calculateUnlockAt,
  stateLabel,
  stateDescription,
  computeEffectiveState,
}                       from '@/lib/qr/lifecycle';
import { generatePublicToken } from '@/lib/qr';
import {
  CommonErrors,
  successResponse,
  withErrorHandling,
}                       from '@/lib/errors';
import type { QRState, QRConfigUpdate } from '@/types/v2';

// ── Token generation ──────────────────────────────────────────────────────────
// generatePublicToken() now lives in lib/qr.ts — imported above.
// (Previously defined here; consolidated to avoid drift across the several
// other call sites that also need to lazily generate a publicToken.)

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) return CommonErrors.unauthorized();

  await assertMemorialAccess(id, userId, 'read');
  await assertFeatureEnabled(userId, 'qrLifecycle');

  const memorial = await prisma.memorial.findUnique({
    where: { id: id },
    select: {
      id:                true,
      slug:              true,
      publicToken:       true,
      qrState:           true,
      serviceStartAt:    true,
      unlockAt:          true,
      pamphletEnabled:   true,
      pamphletTitle:     true,
      pamphletVenueNote: true,
      pamphletMessage:   true,
      organisation: {
        select: { defaultUnlockDelayHours: true },
      },
    },
  });

  if (!memorial) return CommonErrors.notFound('Memorial');

  // Generate publicToken if not yet assigned — idempotent after first call
  let { publicToken } = memorial;
  if (!publicToken) {
    publicToken = generatePublicToken();
    await prisma.memorial.update({
      where: { id: id },
      data:  { publicToken },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://memoriam.app';

  // Every memorial should have a slug by this point (backfilled + set at
  // creation going forward — see lib/memorial/slug.ts). This fallback
  // exists only to avoid a broken QR URL in the unlikely case an older
  // row somehow slipped through without one; it should never trigger in
  // practice post-backfill.
  const urlSlug = memorial.slug ?? memorial.id;
  const qrUrl   = `${appUrl}/v/${urlSlug}?key=${publicToken}`;

  // Generate QR as SVG string.
  // errorCorrectionLevel H = 30% damage recovery — important for physical materials
  // (plaques, booklets, headstones) that may become worn over 20+ years.
  // Color option removed — not supported by qrcode toString for SVG type.
  const qrSvg = await QRCode.toString(qrUrl, {
    type:                 'svg',
    errorCorrectionLevel: 'H',
    margin:               2,
  });

  const effectiveState = computeEffectiveState({
    qrState:        memorial.qrState,
    serviceStartAt: memorial.serviceStartAt,
    unlockAt:       memorial.unlockAt,
  });

  const defaultDelayHours = memorial.organisation?.defaultUnlockDelayHours ?? 24;

  return successResponse({
    publicToken,
    slug: urlSlug,
    qrUrl,
    qrSvg,
    qrState:          memorial.qrState as QRState,
    effectiveState,
    stateLabel:       stateLabel(effectiveState),
    stateDescription: stateDescription(effectiveState),
    serviceStartAt:   memorial.serviceStartAt?.toISOString() ?? null,
    unlockAt:         memorial.unlockAt?.toISOString() ?? null,
    pamphletEnabled:   memorial.pamphletEnabled,
    pamphletTitle:     memorial.pamphletTitle,
    pamphletVenueNote: memorial.pamphletVenueNote,
    pamphletMessage:   memorial.pamphletMessage,
    defaultUnlockDelayHours: defaultDelayHours,
    // Suggested unlock time shown in the dashboard config UI
    suggestedUnlockAt: memorial.serviceStartAt
      ? calculateUnlockAt(
          memorial.serviceStartAt,
          defaultDelayHours,
        ).toISOString()
      : null,
  });
});

// ── PUT ───────────────────────────────────────────────────────────────────────

export const PUT = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) return CommonErrors.unauthorized();

  await assertMemorialAccess(id, userId, 'edit');
  await assertFeatureEnabled(userId, 'qrLifecycle');

  const body: QRConfigUpdate = await req.json();

  // Fetch current state for transition validation
  const current = await prisma.memorial.findUnique({
    where:  { id: id },
    select: { qrState: true },
  });
  if (!current) return CommonErrors.notFound('Memorial');

  // Validate new qrState if provided
  if (body.qrState !== undefined) {
    if (!isValidQRState(body.qrState)) {
      return CommonErrors.badRequest(
        `Invalid qrState "${body.qrState}". ` +
        `Valid values: PRE_SERVICE, SERVICE_ACTIVE, UNLOCK_PENDING, ` +
        `MEMORIAL_OPEN, PRIVATE, ARCHIVED`,
      );
    }

    const from = current.qrState as QRState;
    const to   = body.qrState;

    // ARCHIVED is terminal — no transitions out
    if (from === 'ARCHIVED') {
      return CommonErrors.badRequest('Archived memorials cannot change state');
    }

    if (!isValidTransition(from, to)) {
      return CommonErrors.badRequest(
        `Cannot transition from ${from} to ${to}`,
      );
    }
  }

  // Validate and parse dates
  let serviceStartAt: Date | undefined;
  let unlockAt: Date | undefined;

  if (body.serviceStartAt !== undefined) {
    const d = new Date(body.serviceStartAt);
    if (isNaN(d.getTime())) {
      return CommonErrors.badRequest(
        'Invalid serviceStartAt — must be ISO 8601 e.g. 2024-06-15T14:00:00Z',
      );
    }
    serviceStartAt = d;
  }

  if (body.unlockAt !== undefined) {
    const d = new Date(body.unlockAt);
    if (isNaN(d.getTime())) {
      return CommonErrors.badRequest(
        'Invalid unlockAt — must be ISO 8601 e.g. 2024-06-16T14:00:00Z',
      );
    }
    if (serviceStartAt && d < serviceStartAt) {
      return CommonErrors.badRequest(
        'unlockAt must not be before serviceStartAt',
      );
    }
    unlockAt = d;
  }

  // Build update — only include fields that were explicitly provided
  const data: Record<string, unknown> = {};
  if (body.qrState           !== undefined) data.qrState           = body.qrState;
  if (serviceStartAt         !== undefined) data.serviceStartAt    = serviceStartAt;
  if (unlockAt               !== undefined) data.unlockAt          = unlockAt;
  if (body.pamphletEnabled   !== undefined) data.pamphletEnabled   = body.pamphletEnabled;
  if (body.pamphletTitle     !== undefined) data.pamphletTitle     = body.pamphletTitle?.trim()     || null;
  if (body.pamphletVenueNote !== undefined) data.pamphletVenueNote = body.pamphletVenueNote?.trim() || null;
  if (body.pamphletMessage   !== undefined) data.pamphletMessage   = body.pamphletMessage?.trim()   || null;

  const updated = await prisma.memorial.update({
    where:  { id: id },
    data,
    select: {
      id:                true,
      qrState:           true,
      serviceStartAt:    true,
      unlockAt:          true,
      pamphletEnabled:   true,
      pamphletTitle:     true,
      pamphletVenueNote: true,
      pamphletMessage:   true,
    },
  });

  const effectiveState = computeEffectiveState({
    qrState:        updated.qrState,
    serviceStartAt: updated.serviceStartAt,
    unlockAt:       updated.unlockAt,
  });

  return successResponse({
    ...updated,
    effectiveState,
    stateLabel:       stateLabel(effectiveState),
    stateDescription: stateDescription(effectiveState),
  });
});
