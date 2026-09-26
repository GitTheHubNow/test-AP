// app/api/org/pet-intake-requests/[requestId]/route.ts
//
// PATCH /api/org/pet-intake-requests/[requestId] — approve or reject a
// pending intake request.
//
// Approving does two things atomically: creates the real PetCase (same
// shape as POST /api/org/pet-cases — fresh trackerToken, initial INTAKE
// stage event) and marks this request APPROVED with a link to it. Staff
// supply caseRef at approval time (not at submission — the public form
// has no way to know your org's numbering scheme) and can override any
// field the submitter provided, since public-form input is unvalidated
// and often imprecise (see the model's own comment in schema.prisma).

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { randomUUID }                 from 'crypto';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser }            from '@/lib/tenant';

type Params = { params: Promise<{ requestId: string }> };

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const { requestId } = await params;

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

    const existing = await prisma.petIntakeRequest.findFirst({
      where: { id: requestId, organisationId: orgId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: `This request was already ${existing.status.toLowerCase()}.` },
        { status: 409 },
      );
    }

    let body: {
      action?:            'APPROVE' | 'REJECT';
      rejectionReason?:   string;
      // Approval overrides — staff can correct anything the public
      // submitter got wrong or left vague before it becomes a real case.
      caseRef?:           string;
      petName?:           string;
      species?:           string;
      breed?:             string;
      ownerContactName?:  string;
      ownerContactEmail?: string;
      ownerContactPhone?: string;
      vetClinicName?:     string;
      serviceType?:       string;
      notes?:             string;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    if (body.action !== 'APPROVE' && body.action !== 'REJECT') {
      return NextResponse.json({ success: false, error: 'action must be APPROVE or REJECT' }, { status: 400 });
    }

    if (body.action === 'REJECT') {
      const updated = await prisma.petIntakeRequest.update({
        where: { id: requestId },
        data: {
          status:          'REJECTED',
          reviewedBy:      userId,
          reviewedAt:      new Date(),
          rejectionReason: body.rejectionReason?.trim() || null,
        },
      });
      return NextResponse.json({ success: true, data: { request: updated } });
    }

    // ── APPROVE ──────────────────────────────────────────────────────────────

    const caseRef = body.caseRef?.trim();
    if (!caseRef) {
      return NextResponse.json(
        { success: false, error: 'caseRef is required to approve — this becomes the new pet case\'s reference number.' },
        { status: 400 },
      );
    }

    const conflict = await prisma.petCase.findFirst({
      where: { organisationId: orgId, caseRef },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { success: false, error: `Case reference "${caseRef}" already exists.` },
        { status: 409 },
      );
    }

    const petName          = body.petName?.trim()          || existing.petName;
    const ownerContactName = body.ownerContactName?.trim()  || existing.ownerContactName;

    const [petCase, updatedRequest] = await prisma.$transaction([
      prisma.petCase.create({
        data: {
          organisationId:    orgId,
          caseRef,
          petName,
          species:           (body.species?.trim()           ?? existing.species)           || null,
          breed:             (body.breed?.trim()              ?? existing.breed)             || null,
          ownerContactName,
          ownerContactEmail: (body.ownerContactEmail?.trim()  ?? existing.ownerContactEmail) || null,
          ownerContactPhone: (body.ownerContactPhone?.trim()  ?? existing.ownerContactPhone) || null,
          intakeSource:      existing.submittedBy,
          vetClinicName:     (body.vetClinicName?.trim()      ?? existing.vetClinicName)     || null,
          vetContactName:    existing.vetContactName,
          vetContactEmail:   existing.vetContactEmail,
          vetContactPhone:   existing.vetContactPhone,
          serviceType:       (body.serviceType?.trim()        ?? existing.serviceType)       || null,
          notes:             (body.notes?.trim()               ?? existing.notes)             || null,
          trackerToken: randomUUID().replace(/-/g, ''),
          stageEvents: {
            create: { stage: 'INTAKE', createdBy: userId, note: 'Created from an intake request' },
          },
        },
      }),
      prisma.petIntakeRequest.update({
        where: { id: requestId },
        data:  { status: 'APPROVED', reviewedBy: userId, reviewedAt: new Date() },
      }),
    ]);

    // Link the two records together — done as a follow-up update rather
    // than inside the transaction's create() above because petCase.id
    // doesn't exist yet at the point the transaction array is built.
    await prisma.petIntakeRequest.update({
      where: { id: requestId },
      data:  { resultingPetCaseId: petCase.id },
    });

    return NextResponse.json({ success: true, data: { petCase, request: updatedRequest } }, { status: 201 });

  } catch (err: any) {
    console.error('[org/pet-intake-requests/[requestId]/PATCH]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
