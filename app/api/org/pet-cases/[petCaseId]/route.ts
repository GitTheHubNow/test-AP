// app/api/org/pet-cases/[petCaseId]/route.ts
//
// GET    /api/org/pet-cases/[petCaseId]  — fetch single pet case + stage history
// PATCH  /api/org/pet-cases/[petCaseId]  — update fields, incl. stage transitions
// DELETE /api/org/pet-cases/[petCaseId]  — delete (only when no linked memorial)
//
// Mirrors app/api/org/cases/[caseId]/route.ts. The one real divergence:
// PATCH's stage handling. A stage change here isn't just a field update —
// it's the event the owner tracker page renders as a timeline, so every
// change writes a PetCaseStageEvent row and stamps the matching milestone
// timestamp (collectedAt/receivedAt/readyAt/returnedAt), in addition to
// updating PetCase.stage itself.
//
// Auth: Clerk session + org membership.
// Feature flag: featurePetAftercare.
// Ownership: pet case must belong to the user's org.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';

type Params = { params: Promise<{ petCaseId: string }> };

const VALID_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

// Order matters here — used to validate that a stage change only moves
// forward or backward by adjacent steps, not an arbitrary jump (e.g.
// INTAKE straight to READY skipping RECEIVED/IN_CARE). Staff correcting
// a mistake by moving back one step is fine; skipping stages usually
// means a missed step in real life, not just a data-entry shortcut, so
// it's worth surfacing as an explicit error rather than silently allowing it.
const STAGE_ORDER = ['INTAKE', 'RECEIVED', 'IN_CARE', 'READY', 'RETURNED'] as const;
type Stage = typeof STAGE_ORDER[number];

// Which PetCase timestamp column each stage's *entry* corresponds to.
// INTAKE has no timestamp column of its own — createdAt already covers it.
const STAGE_TIMESTAMP_FIELD: Partial<Record<Stage, 'collectedAt' | 'receivedAt' | 'readyAt' | 'returnedAt'>> = {
  RECEIVED: 'collectedAt', // pet was collected FROM somewhere, arriving here as "received"
  IN_CARE:  'receivedAt',  // facility formally received/checked in the pet before starting care
  READY:    'readyAt',
  RETURNED: 'returnedAt',
};

async function resolvePetCase(petCaseId: string, orgId: string) {
  return prisma.petCase.findFirst({
    where: { id: petCaseId, organisationId: orgId },
  });
}

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

export async function GET(_req: NextRequest, { params }: Params) {
  const { petCaseId } = await params;

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

    const petCase = await prisma.petCase.findFirst({
      where: { id: petCaseId, organisationId: orgId },
      include: {
        memorial: {
          select: {
            id: true, qrTokenHash: true, title: true,
            firstName: true, lastName: true, preferredName: true,
            status: true, workflowStage: true, publishedAt: true,
          },
        },
        stageEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!petCase) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { petCase } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-cases/[petCaseId]/GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { petCaseId } = await params;

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

    const existing = await resolvePetCase(petCaseId, orgId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    let body: {
      caseRef?:           string;
      petName?:           string;
      species?:           string | null;
      breed?:             string | null;
      ownerContactName?:  string;
      ownerContactEmail?: string | null;
      ownerContactPhone?: string | null;
      vetClinicName?:     string | null;
      vetContactName?:    string | null;
      vetContactEmail?:   string | null;
      vetContactPhone?:   string | null;
      serviceType?:       string | null;
      notes?:             string | null;
      status?:            string;
      stage?:             string;
      stageNote?:         string; // optional note attached to a stage-change event
      memorialId?:        string | null;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const update: Record<string, unknown> = {};

    if (body.caseRef !== undefined) {
      const ref = body.caseRef.trim();
      if (!ref) {
        return NextResponse.json({ success: false, error: 'caseRef cannot be empty' }, { status: 400 });
      }
      if (ref !== existing.caseRef) {
        const conflict = await prisma.petCase.findFirst({
          where: { organisationId: orgId, caseRef: ref, NOT: { id: petCaseId } },
          select: { id: true },
        });
        if (conflict) {
          return NextResponse.json(
            { success: false, error: `Case reference "${ref}" already exists.` },
            { status: 409 },
          );
        }
      }
      update.caseRef = ref;
    }

    if (body.petName !== undefined) {
      if (!body.petName.trim()) {
        return NextResponse.json({ success: false, error: 'petName cannot be empty' }, { status: 400 });
      }
      update.petName = body.petName.trim();
    }

    if (body.ownerContactName !== undefined) {
      if (!body.ownerContactName.trim()) {
        return NextResponse.json({ success: false, error: 'ownerContactName cannot be empty' }, { status: 400 });
      }
      update.ownerContactName = body.ownerContactName.trim();
    }

    if (body.species           !== undefined) update.species           = body.species?.trim()           || null;
    if (body.breed             !== undefined) update.breed             = body.breed?.trim()              || null;
    if (body.ownerContactEmail !== undefined) update.ownerContactEmail = body.ownerContactEmail?.trim()  || null;
    if (body.ownerContactPhone !== undefined) update.ownerContactPhone = body.ownerContactPhone?.trim()  || null;
    if (body.vetClinicName     !== undefined) update.vetClinicName     = body.vetClinicName?.trim()      || null;
    if (body.vetContactName    !== undefined) update.vetContactName    = body.vetContactName?.trim()     || null;
    if (body.vetContactEmail   !== undefined) update.vetContactEmail   = body.vetContactEmail?.trim()    || null;
    if (body.vetContactPhone   !== undefined) update.vetContactPhone   = body.vetContactPhone?.trim()    || null;
    if (body.serviceType       !== undefined) update.serviceType       = body.serviceType?.trim()        || null;
    if (body.notes             !== undefined) update.notes             = body.notes?.trim()               || null;

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as any)) {
        return NextResponse.json(
          { success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
      update.status = body.status;
    }

    // ── Stage transition — the one genuinely different piece vs FuneralCase.
    // A stage change here means: update PetCase.stage, stamp the matching
    // milestone timestamp (only when moving FORWARD into that stage, never
    // when correcting backward — a backward correction shouldn't claim a
    // fresh "received at" time), and append a PetCaseStageEvent so the
    // owner tracker has a real timeline to render.
    let stageEventToCreate: { stage: Stage; note: string | null } | null = null;

    if (body.stage !== undefined) {
      if (!STAGE_ORDER.includes(body.stage as Stage)) {
        return NextResponse.json(
          { success: false, error: `stage must be one of: ${STAGE_ORDER.join(', ')}` },
          { status: 400 },
        );
      }
      const newStage = body.stage as Stage;
      const currentIndex = STAGE_ORDER.indexOf(existing.stage as Stage);
      const newIndex     = STAGE_ORDER.indexOf(newStage);

      if (Math.abs(newIndex - currentIndex) > 1) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot jump from ${existing.stage} to ${newStage} — stages must move one at a time (use ${STAGE_ORDER[currentIndex + (newIndex > currentIndex ? 1 : -1)]} first).`,
          },
          { status: 400 },
        );
      }

      if (newStage !== existing.stage) {
        update.stage = newStage;

        // Only stamp the milestone timestamp when moving forward into a
        // stage for the first time — a backward correction (e.g. staff
        // accidentally advanced too soon) shouldn't overwrite an already-
        // correct earlier timestamp, and re-entering a stage moving
        // forward again after a correction should refresh it.
        if (newIndex > currentIndex) {
          const tsField = STAGE_TIMESTAMP_FIELD[newStage];
          if (tsField) update[tsField] = new Date();
        }

        stageEventToCreate = { stage: newStage, note: body.stageNote?.trim() || null };
      }
    }

    // Link or unlink a memorial — same pattern as FuneralCase
    if (body.memorialId !== undefined) {
      if (body.memorialId === null) {
        update.memorialId = null;
      } else {
        const mem = await prisma.memorial.findFirst({
          where:  { id: body.memorialId, organisationId: orgId },
          select: { id: true },
        });
        if (!mem) {
          return NextResponse.json(
            { success: false, error: 'Memorial not found or does not belong to your organisation.' },
            { status: 404 },
          );
        }
        const alreadyLinked = await prisma.petCase.findFirst({
          where: { memorialId: body.memorialId, NOT: { id: petCaseId } },
          select: { id: true, caseRef: true },
        });
        if (alreadyLinked) {
          return NextResponse.json(
            { success: false, error: `This memorial is already linked to pet case ${alreadyLinked.caseRef}.` },
            { status: 409 },
          );
        }
        update.memorialId = body.memorialId;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.petCase.update({
      where: { id: petCaseId },
      data: {
        ...update,
        ...(stageEventToCreate
          ? { stageEvents: { create: { stage: stageEventToCreate.stage, note: stageEventToCreate.note, createdBy: userId } } }
          : {}),
      },
      include: {
        memorial: {
          select: {
            id: true, qrTokenHash: true, title: true,
            firstName: true, lastName: true, preferredName: true, status: true,
          },
        },
        stageEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

    return NextResponse.json({ success: true, data: { petCase: updated } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-cases/[petCaseId]/PATCH]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { petCaseId } = await params;

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

    const existing = await resolvePetCase(petCaseId, orgId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    if (existing.memorialId) {
      return NextResponse.json(
        { success: false, error: 'Unlink the memorial before deleting this pet case.' },
        { status: 409 },
      );
    }

    // stageEvents cascade-delete automatically (onDelete: Cascade in schema)
    await prisma.petCase.delete({ where: { id: petCaseId } });

    return NextResponse.json({ success: true, data: { deleted: true } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/pet-cases/[petCaseId]/DELETE]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
