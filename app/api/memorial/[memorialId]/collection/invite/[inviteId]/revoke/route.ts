import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CollectionInviteStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/collection/invite/[inviteId]/revoke
 *
 * Revoke a pending invite link.
 * Org-scoped edit access (previously a manual ownerId check that blocked
 * org staff — fixed to use assertMemorialAccess).
 *
 * ✅ Phase 11c
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; inviteId: string }> }
) {
  const { memorialId, inviteId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const invite = await prisma.collectionInvite.findUnique({
    where:  { id: inviteId },
    select: { id: true, memorialId: true, status: true },
  });

  if (!invite || invite.memorialId !== memorialId) {
    return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
  }

  if (invite.status !== CollectionInviteStatus.PENDING) {
    return NextResponse.json(
      { success: false, error: `Cannot revoke invite with status: ${invite.status}` },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.collectionInvite.update({
      where: { id: invite.id },
      data:  { status: CollectionInviteStatus.REVOKED },
    });

    await tx.auditEvent.create({
      data: {
        entityType: EntityType.COLLECTION_INVITE,
        entityId:   invite.id,
        action:     AuditAction.UPDATE,
        actorId:    userId,
        actorRole:  ActorRole.OWNER,
        reasonCode: ReasonCode.REVOCATION,
        metadata:   { memorialId: memorialId },
      },
    });
  });

  return NextResponse.json({ success: true });
}
