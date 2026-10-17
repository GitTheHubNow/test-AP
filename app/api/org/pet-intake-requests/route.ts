// app/api/org/pet-intake-requests/route.ts
//
// GET /api/org/pet-intake-requests?status=PENDING — list intake requests
// for staff review. Mirrors app/api/org/pet-cases/route.ts's guard
// sequence (auth → org → featurePetAftercare) and response envelope.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
type Status = typeof VALID_STATUSES[number];

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

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const statusFilter: Status = statusParam && VALID_STATUSES.includes(statusParam as Status)
      ? (statusParam as Status)
      : 'PENDING'; // default view is the actual review queue

    const requests = await prisma.petIntakeRequest.findMany({
      where:   { organisationId: orgId, status: statusFilter },
      orderBy: [{ createdAt: 'asc' }], // oldest first — first in, first reviewed
    });

    return NextResponse.json({ success: true, data: { requests } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-intake-requests/GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
