// app/api/memorial/[memorialId]/handover/complete/route.ts
//
// Marks a handover COMPLETED directly, without any family Clerk account.
// This is the actual completion trigger for the no-Clerk family-access
// model described in this whole feature — as opposed to
// app/api/handover/accept/[token]/route.ts, which requires the family
// member to sign in with Clerk first. Both routes now call
// lib/familyAccess.ts's grantFamilyAccess() on completion, so family
// self-service access works identically regardless of which path a
// given memorial's handover went through.
//
// Deliberately does NOT touch Memorial.ownerId. The existing Clerk-based
// accept route transfers ownerId to the family member's Clerk user ID —
// there is no equivalent user here, so ownerId simply stays whatever it
// already is (the funeral home's org/staff). Memorial.familyClerkUserId
// was already nullable in the schema before this feature existed, so no
// migration was needed to support that. Ownership (who the database
// record's ownerId is) and family control (the separate assertFamilyAccess
// layer) are deliberately two different, independent concepts now — not
// two names for the same thing the way the Clerk-accept flow treats them.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { grantFamilyAccess } from '@/lib/familyAccess';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';

export async function POST(
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

  const handover = await prisma.memorialHandover.findUnique({
    where:  { memorialId },
    select: { id: true, status: true },
  });

  if (!handover) {
    return NextResponse.json({ success: false, error: 'No handover exists for this memorial. Initiate one first.' }, { status: 404 });
  }
  if (handover.status === 'COMPLETED') {
    return NextResponse.json({ success: false, error: 'This handover is already complete.' }, { status: 409 });
  }
  if (handover.status === 'CANCELLED') {
    return NextResponse.json({ success: false, error: 'This handover was cancelled.' }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.memorial.update({
      where: { id: memorialId },
      data:  { workflowStage: 'HANDED_OVER' },
      // ownerId deliberately untouched — see file header comment.
    });

    await tx.memorialHandover.update({
      where: { id: handover.id },
      data:  { status: 'COMPLETED', completedAt: new Date() },
      // familyClerkUserId deliberately left null — there is no Clerk
      // user for this handover path, and the field already supported
      // that before this feature existed.
    });

    await tx.auditEvent.create({
      data: {
        entityType: EntityType.HANDOVER, entityId: handover.id,
        action:     AuditAction.HANDOVER_COMPLETED,
        actorId:    userId,
        actorRole:  ActorRole.FUNERAL_HOME,
        reasonCode: ReasonCode.HANDOVER,
        metadata:   { method: 'no-clerk-direct-complete' },
      },
    });
  });

  const grantResult = await grantFamilyAccess(memorialId, userId, ActorRole.FUNERAL_HOME);
  if (!grantResult.ok) {
    // The handover itself succeeded — this is a secondary failure the
    // caller should know about, not something that should make the
    // whole request look like it failed.
    console.error('[handover/complete] family-access grant failed:', grantResult.error);
    return NextResponse.json({
      success: true,
      data: { warning: 'Handover completed, but sending family access failed. Use "Resend Access Card" to try again.' },
    });
  }

  return NextResponse.json({ success: true, data: { familyAccessToken: grantResult.familyAccessToken } });
}
