// app/api/org/pet-cases/route.ts
//
// GET  /api/org/pet-cases?status=ACTIVE&stage=INTAKE   — list all pet cases for the org
// POST /api/org/pet-cases                              — create a new pet case
//
// Mirrors app/api/org/cases/route.ts (the human FuneralCase equivalent) —
// same auth/org/feature-flag guard sequence, same { success, data } /
// { success, error } response envelope, same caseRef-uniqueness-per-org
// check. Deliberately its own route rather than a shared one: see the
// PetCase model comment in schema.prisma for why the two case types stay
// separate all the way through the stack.
//
// Auth: Clerk session + org membership.
// Feature flag: featurePetAftercare must be true on the org.
//
// GET supports optional ?status and ?stage filters. Results ordered by
// createdAt desc (newest first) — unlike FuneralCase's serviceDate-first
// ordering, pet cases don't have a single "upcoming event" date to sort
// by; the active queue is better served by "most recently touched".

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { randomUUID }                 from 'crypto';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';

const VALID_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
type Status = typeof VALID_STATUSES[number];

const VALID_STAGES = ['INTAKE', 'RECEIVED', 'IN_CARE', 'READY', 'RETURNED'] as const;
type Stage = typeof VALID_STAGES[number];

const VALID_INTAKE_SOURCES = ['VET', 'OWNER', 'WALK_IN'] as const;
type IntakeSource = typeof VALID_INTAKE_SOURCES[number];

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
    const statusFilter: Status | undefined =
      statusParam && VALID_STATUSES.includes(statusParam as Status)
        ? (statusParam as Status)
        : undefined;

    const stageParam = searchParams.get('stage');
    const stageFilter: Stage | undefined =
      stageParam && VALID_STAGES.includes(stageParam as Stage)
        ? (stageParam as Stage)
        : undefined;

    const petCases = await prisma.petCase.findMany({
      where: {
        organisationId: orgId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(stageFilter  ? { stage:  stageFilter  } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id:               true,
        caseRef:          true,
        petName:          true,
        species:          true,
        breed:            true,
        ownerContactName: true,
        ownerContactEmail:true,
        ownerContactPhone:true,
        intakeSource:     true,
        vetClinicName:    true,
        stage:            true,
        serviceType:      true,
        status:           true,
        collectedAt:      true,
        receivedAt:       true,
        readyAt:          true,
        returnedAt:       true,
        trackerToken:     true,
        memorialId:       true,
        createdAt:        true,
        updatedAt:        true,
        // Just enough memorial data to show a link in the UI, same shape
        // as FuneralCase's list route.
        memorial: {
          select: {
            id:            true,
            qrTokenHash:   true,
            title:         true,
            firstName:     true,
            lastName:      true,
            preferredName: true,
            status:        true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { petCases } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-cases/GET]', err);
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
      caseRef?:           string;
      petName?:           string;
      species?:           string;
      breed?:             string;
      ownerContactName?:  string;
      ownerContactEmail?: string;
      ownerContactPhone?: string;
      intakeSource?:      string;
      vetClinicName?:     string;
      vetContactName?:    string;
      vetContactEmail?:   string;
      vetContactPhone?:   string;
      serviceType?:       string;
      notes?:             string;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.caseRef?.trim()) {
      return NextResponse.json({ success: false, error: 'caseRef is required' }, { status: 400 });
    }
    if (!body.petName?.trim()) {
      return NextResponse.json({ success: false, error: 'petName is required' }, { status: 400 });
    }
    if (!body.ownerContactName?.trim()) {
      return NextResponse.json({ success: false, error: 'ownerContactName is required' }, { status: 400 });
    }

    let intakeSource: IntakeSource = 'OWNER';
    if (body.intakeSource !== undefined) {
      if (!VALID_INTAKE_SOURCES.includes(body.intakeSource as IntakeSource)) {
        return NextResponse.json(
          { success: false, error: `intakeSource must be one of: ${VALID_INTAKE_SOURCES.join(', ')}` },
          { status: 400 },
        );
      }
      intakeSource = body.intakeSource as IntakeSource;
    }

    // Check caseRef uniqueness within org — mirrors FuneralCase's check
    const existing = await prisma.petCase.findFirst({
      where: { organisationId: orgId, caseRef: body.caseRef.trim() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Case reference "${body.caseRef.trim()}" already exists.` },
        { status: 409 },
      );
    }

    const petCase = await prisma.petCase.create({
      data: {
        organisationId:    orgId,
        caseRef:           body.caseRef.trim(),
        petName:           body.petName.trim(),
        species:           body.species?.trim()           || null,
        breed:             body.breed?.trim()              || null,
        ownerContactName:  body.ownerContactName.trim(),
        ownerContactEmail: body.ownerContactEmail?.trim()  || null,
        ownerContactPhone: body.ownerContactPhone?.trim()  || null,
        intakeSource,
        vetClinicName:     body.vetClinicName?.trim()      || null,
        vetContactName:    body.vetContactName?.trim()     || null,
        vetContactEmail:   body.vetContactEmail?.trim()    || null,
        vetContactPhone:   body.vetContactPhone?.trim()    || null,
        serviceType:       body.serviceType?.trim()        || null,
        notes:             body.notes?.trim()               || null,
        // trackerToken is generated immediately at creation, not lazily
        // like Memorial.publicToken — a pet case's owner tracker link
        // needs to exist and be shareable from the moment staff create
        // the case (e.g. printed on an intake receipt, texted to the
        // owner on the spot), not deferred to a later "open the QR
        // panel" action the way memorials work.
        trackerToken: randomUUID().replace(/-/g, ''),
        stageEvents: {
          create: {
            stage:     'INTAKE',
            createdBy: userId,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { petCase } }, { status: 201 });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-cases/POST]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
