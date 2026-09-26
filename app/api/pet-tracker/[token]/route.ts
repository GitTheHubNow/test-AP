// app/api/pet-tracker/[token]/route.ts
//
// GET /api/pet-tracker/[token]  — public, no auth. The owner-facing
// tracker page (app/pet-tracker/[token]/page.tsx) calls this to render
// the progress timeline.
//
// Mirrors the no-auth-token-as-credential pattern used by
// app/api/collect/[token]/route.ts — token is the authentication
// mechanism, so this only ever returns the minimal fields an owner
// should see, never anything staff-only (vet contact details, internal
// notes, organisationId, etc).
//
// Read-only by design — the owner tracker page is informational, not
// interactive. If a future "confirm collection option" action (see the
// original workflow notes' pet example) gets built, that should be a
// separate, narrowly-scoped POST route, not added here.

import { NextRequest, NextResponse } from 'next/server';
import { prisma }                     from '@/lib/prisma';
import { checkRateLimit }             from '@/lib/rateLimit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Same reasoning as collect/[token]: bucket per-token so one owner
  // refreshing the page repeatedly doesn't get blocked, but a token
  // being hammered/enumerated does.
  const limited = await checkRateLimit(request, `pet-tracker:${token}`, { max: 30, windowMs: 60 * 1000 });
  if (limited) return limited;

  const petCase = await prisma.petCase.findUnique({
    where:  { trackerToken: token },
    select: {
      petName:      true,
      species:      true,
      breed:        true,
      stage:        true,
      serviceType:  true,
      collectedAt:  true,
      receivedAt:   true,
      readyAt:      true,
      returnedAt:   true,
      createdAt:    true,
      organisation: { select: { name: true, brandName: true, logoUrl: true, primaryColor: true } },
      memorial:     { select: { slug: true, publicToken: true, status: true } },
      stageEvents: {
        orderBy: { createdAt: 'asc' },
        select:  { stage: true, createdAt: true }, // never expose `note` or `createdBy` — staff-only
      },
    },
  });

  if (!petCase) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { petCase } });
}
