// app/api/memorial/[memorialId]/family-consent/route.ts
//
// Records the funeral home's attestation that they have the family's
// consent to publish this specific memorial's content — distinct from
// Organisation.termsAcceptedAt (the org's own Terms/Privacy acceptance
// at signup). Deliberately a separate, explicit action rather than
// something publish sets automatically: the point is a real attestation
// step a staff member has to actively take, not implied consent from
// clicking Publish.
//
// Enforced as a hard gate in app/api/memorial/[memorialId]/publish/route.ts
// — this route only records the attestation, it doesn't publish anything
// itself.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirmed !== true) {
    return NextResponse.json(
      { success: false, error: 'confirmed must be true — this endpoint only records a positive attestation, it cannot un-confirm consent by request.' },
      { status: 400 },
    );
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: { id: true, familyConsentConfirmed: true },
  });
  if (!memorial) {
    return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
  }

  if (memorial.familyConsentConfirmed) {
    return NextResponse.json({ success: true, data: { familyConsentConfirmed: true }, alreadyConfirmed: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.memorial.update({
      where: { id: memorialId },
      data: {
        familyConsentConfirmed:         true,
        familyConsentConfirmedAt:       new Date(),
        familyConsentConfirmedByUserId: userId,
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL,
        entityId:   memorialId,
        action:     AuditAction.UPDATE,
        actorId:    userId,
        actorRole:  ActorRole.FUNERAL_HOME,
        reasonCode: ReasonCode.APPROVAL,
        metadata:   { familyConsentConfirmed: true },
      },
    });
  });

  return NextResponse.json({ success: true, data: { familyConsentConfirmed: true } });
}
