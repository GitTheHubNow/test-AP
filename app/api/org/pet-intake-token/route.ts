// app/api/org/pet-intake-token/route.ts
//
// GET  /api/org/pet-intake-token — return the org's intake QR token,
//      generating one on first use (lazy, same pattern as
//      Memorial.publicToken via lib/qr.ts's ensurePublicToken).
// POST /api/org/pet-intake-token — regenerate it (invalidates the old
//      printed QR code — e.g. if a sheet goes missing).

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { randomUUID }                 from 'crypto';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';

async function guardFeature(orgId: string): Promise<NextResponse | null> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featurePetAftercare: true },
  });
  if (!org?.featurePetAftercare) {
    return NextResponse.json(
      { success: false, error: 'Pet Aftercare feature is not enabled for your organisation.' },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    const blocked = await guardFeature(orgId);
    if (blocked) return blocked;

    const org = await prisma.organisation.findUnique({
      where:  { id: orgId },
      select: { petIntakeToken: true },
    });

    let token = org?.petIntakeToken ?? null;
    if (!token) {
      token = randomUUID().replace(/-/g, '');
      await prisma.organisation.update({
        where: { id: orgId },
        data:  { petIntakeToken: token },
      });
    }

    return NextResponse.json({ success: true, data: { token } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-intake-token/GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    const blocked = await guardFeature(orgId);
    if (blocked) return blocked;

    const token = randomUUID().replace(/-/g, '');
    await prisma.organisation.update({
      where: { id: orgId },
      data:  { petIntakeToken: token },
    });

    return NextResponse.json({ success: true, data: { token } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-intake-token/POST]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
