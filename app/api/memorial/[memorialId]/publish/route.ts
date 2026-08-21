import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/publish
 *
 * Marks a memorial as LIVE. Sets workflowStage = "LIVE" and publishedAt.
 * Memorial must already be ACTIVE status and have at least one approved memory.
 *
 * Org-scoped edit access (previously a manual ownerId check that blocked
 * org staff — the original bug this whole RBAC sweep started from —
 * fixed to use assertMemorialAccess like every other memorial route).
 *
 * ✅ Phase 12c
 */
export async function POST(
  _request: NextRequest,
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

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id:            true,
      workflowStage: true,
      status:        true,
      title:         true,
      _count: {
        select: {
          memories: { where: { status: 'APPROVED', isGuestBook: false } },
        },
      },
    },
  });

  if (!memorial) {
    return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
  }

  if (memorial.workflowStage === 'LIVE') {
    return NextResponse.json({ success: false, error: 'Memorial is already live' }, { status: 409 });
  }

  if (memorial.workflowStage === 'HANDED_OVER') {
    return NextResponse.json({ success: false, error: 'Memorial has been handed over' }, { status: 409 });
  }

  // Minimum requirement: at least one approved memory
  if (memorial._count.memories === 0) {
    return NextResponse.json(
      { success: false, error: 'Memorial needs at least one approved memory before publishing' },
      { status: 422 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.memorial.update({
        where: { id: memorialId },
        data: {
          workflowStage: 'LIVE',
          publishedAt:   new Date(),
          status:        'ACTIVE', // ensure it's active/public
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId:   memorialId,
          action:     AuditAction.PUBLISH,
          actorId:    userId,
          actorRole:  ActorRole.OWNER,
          reasonCode: ReasonCode.APPROVAL,
          metadata: {
            title:         memorial.title,
            approvedCount: memorial._count.memories,
          },
        },
      });
    });

    return NextResponse.json({ success: true, data: { workflowStage: 'LIVE' } });

  } catch (error) {
    console.error('[POST /api/memorial/[id]/publish]', error);
    return NextResponse.json({ success: false, error: 'Failed to publish memorial' }, { status: 500 });
  }
}
