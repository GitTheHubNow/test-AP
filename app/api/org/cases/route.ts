// app/api/org/cases/route.ts
//
// GET  /api/org/cases?status=ACTIVE   — list all cases for the org
// POST /api/org/cases                 — create a new case
//
// Auth: Clerk session + org membership.
// Feature flag: featureCaseLite must be true on the org.
//
// GET supports optional ?status filter (ACTIVE | COMPLETED | CANCELLED).
// Results ordered by serviceDate asc (upcoming first), then createdAt desc.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';

const VALID_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
type CaseStatus = typeof VALID_STATUSES[number];

async function guardFeature(orgId: string): Promise<NextResponse | null> {
  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featureCaseLite: true },
  });
  if (!org?.featureCaseLite) {
    return NextResponse.json(
      { success: false, error: 'Case Lite feature is not enabled for your organisation.' },
      { status: 403 },
    );
  }
  return null;
}

// ── GET ───────────────────────────────────────────────────────────────────────

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
    const statusFilter: CaseStatus | undefined =
      statusParam && VALID_STATUSES.includes(statusParam as CaseStatus)
        ? (statusParam as CaseStatus)
        : undefined;

    const cases = await prisma.funeralCase.findMany({
      where: {
        organisationId: orgId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: [
        { serviceDate: 'asc' },
        { createdAt:   'desc' },
      ],
      select: {
        id:            true,
        caseRef:       true,
        deceasedName:  true,
        familyContact: true,
        contactEmail:  true,
        contactPhone:  true,
        serviceDate:   true,
        venue:         true,
        status:        true,
        notes:         true,
        memorialId:    true,
        createdAt:     true,
        updatedAt:     true,
        // Include just enough memorial data to show a link in the UI
        memorial: {
          select: {
            id:           true,
            qrTokenHash:  true,
            title:        true,
            firstName:    true,
            lastName:     true,
            preferredName:true,
            status:       true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { cases } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/cases/GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

    let body: {
      caseRef?:      string;
      deceasedName?: string;
      familyContact?:string;
      contactEmail?: string;
      contactPhone?: string;
      serviceDate?:  string | null;
      venue?:        string;
      notes?:        string;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.caseRef?.trim()) {
      return NextResponse.json(
        { success: false, error: 'caseRef is required' },
        { status: 400 },
      );
    }
    if (!body.deceasedName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'deceasedName is required' },
        { status: 400 },
      );
    }

    // Check caseRef uniqueness within org
    const existing = await prisma.funeralCase.findFirst({
      where: { organisationId: orgId, caseRef: body.caseRef.trim() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Case reference "${body.caseRef.trim()}" already exists.` },
        { status: 409 },
      );
    }

    const funeralCase = await prisma.funeralCase.create({
      data: {
        organisationId: orgId,
        caseRef:        body.caseRef.trim(),
        deceasedName:   body.deceasedName.trim(),
        familyContact:  body.familyContact?.trim()  || null,
        contactEmail:   body.contactEmail?.trim()   || null,
        contactPhone:   body.contactPhone?.trim()   || null,
        serviceDate:    body.serviceDate ? new Date(body.serviceDate) : null,
        venue:          body.venue?.trim()           || null,
        notes:          body.notes?.trim()           || null,
      },
    });

    return NextResponse.json({ success: true, data: { case: funeralCase } }, { status: 201 });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/cases/POST]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
