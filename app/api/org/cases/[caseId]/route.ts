// app/api/org/cases/[caseId]/route.ts
//
// GET    /api/org/cases/[caseId]  — fetch single case
// PATCH  /api/org/cases/[caseId]  — update case fields including status + memorial link
// DELETE /api/org/cases/[caseId]  — delete case (only when ACTIVE, no linked memorial)
//
// Auth: Clerk session + org membership.
// Feature flag: featureCaseLite.
// Ownership: case must belong to the user's org.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';

type Params = { params: Promise<{ caseId: string }> };

const VALID_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

async function resolveCase(caseId: string, orgId: string) {
  return prisma.funeralCase.findFirst({
    where: { id: caseId, organisationId: orgId },
  });
}

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

export async function GET(_req: NextRequest, { params }: Params) {
  const { caseId } = await params;

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

    const funeralCase = await prisma.funeralCase.findFirst({
      where: { id: caseId, organisationId: orgId },
      include: {
        memorial: {
          select: {
            id:            true,
            qrTokenHash:   true,
            title:         true,
            firstName:     true,
            lastName:      true,
            preferredName: true,
            status:        true,
            workflowStage: true,
            publishedAt:   true,
          },
        },
      },
    });

    if (!funeralCase) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { case: funeralCase } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/cases/[caseId]/GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { caseId } = await params;

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

    const existing = await resolveCase(caseId, orgId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    let body: {
      caseRef?:      string;
      deceasedName?: string;
      familyContact?:string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      serviceDate?:  string | null;
      venue?:        string | null;
      notes?:        string | null;
      status?:       string;
      memorialId?:   string | null;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const update: Record<string, unknown> = {};

    if (body.caseRef !== undefined) {
      const ref = body.caseRef.trim();
      if (!ref) {
        return NextResponse.json({ success: false, error: 'caseRef cannot be empty' }, { status: 400 });
      }
      // Check uniqueness only if the ref is changing
      if (ref !== existing.caseRef) {
        const conflict = await prisma.funeralCase.findFirst({
          where: { organisationId: orgId, caseRef: ref, NOT: { id: caseId } },
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

    if (body.deceasedName !== undefined) {
      if (!body.deceasedName.trim()) {
        return NextResponse.json({ success: false, error: 'deceasedName cannot be empty' }, { status: 400 });
      }
      update.deceasedName = body.deceasedName.trim();
    }

    if (body.familyContact !== undefined) update.familyContact = body.familyContact?.trim() || null;
    if (body.contactEmail  !== undefined) update.contactEmail  = body.contactEmail?.trim()  || null;
    if (body.contactPhone  !== undefined) update.contactPhone  = body.contactPhone?.trim()  || null;
    if (body.venue         !== undefined) update.venue         = body.venue?.trim()          || null;
    if (body.notes         !== undefined) update.notes         = body.notes?.trim()          || null;

    if (body.serviceDate !== undefined) {
      update.serviceDate = body.serviceDate ? new Date(body.serviceDate) : null;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as any)) {
        return NextResponse.json(
          { success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
      update.status = body.status;
    }

    // Link or unlink a memorial
    if (body.memorialId !== undefined) {
      if (body.memorialId === null) {
        update.memorialId = null;
      } else {
        // Verify the memorial belongs to this org
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
        // Check it isn't already linked to another case
        const alreadyLinked = await prisma.funeralCase.findFirst({
          where: { memorialId: body.memorialId, NOT: { id: caseId } },
          select: { id: true, caseRef: true },
        });
        if (alreadyLinked) {
          return NextResponse.json(
            { success: false, error: `This memorial is already linked to case ${alreadyLinked.caseRef}.` },
            { status: 409 },
          );
        }
        update.memorialId = body.memorialId;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.funeralCase.update({
      where: { id: caseId },
      data:  update,
      include: {
        memorial: {
          select: {
            id: true, qrTokenHash: true, title: true,
            firstName: true, lastName: true, preferredName: true, status: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { case: updated } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/cases/[caseId]/PATCH]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { caseId } = await params;

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

    const existing = await resolveCase(caseId, orgId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Safety guard — don't delete cases with a linked memorial
    if (existing.memorialId) {
      return NextResponse.json(
        { success: false, error: 'Unlink the memorial before deleting this case.' },
        { status: 409 },
      );
    }

    await prisma.funeralCase.delete({ where: { id: caseId } });

    return NextResponse.json({ success: true, data: { deleted: true } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/cases/[caseId]/DELETE]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
