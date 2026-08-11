import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError, handleAuthError } from '@/lib/errors';
import { validateParam, MemorialIdSchema, GuestBookIdSchema } from '@/lib/validation';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

/**
 * POST /api/memorial/[memorialId]/guest-book/[entryId]/approve
 *
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check — fixed to use assertMemorialAccess). Approves a pending guest
 * book entry so it appears on the public memorial page. Mirrors the
 * memory approve route's shape — see
 * app/api/memorial/[memorialId]/memory/[memoryId]/approve/route.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { memorialId: string; entryId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return CommonErrors.unauthorized();

    const memorialValidation = validateParam(params.memorialId, MemorialIdSchema);
    if (!memorialValidation.success) return CommonErrors.badRequest(memorialValidation.error);

    const entryValidation = validateParam(params.entryId, GuestBookIdSchema);
    if (!entryValidation.success) return CommonErrors.badRequest(entryValidation.error);

    await assertMemorialAccess(params.memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: { readOnly: true },
    });

    if (!memorial) return CommonErrors.notFound('Memorial');
    if (memorial.readOnly) return CommonErrors.badRequest('Memorial is read-only');

    const entry = await prisma.guestBookEntry.findUnique({
      where: { id: params.entryId },
      select: { id: true, memorialId: true },
    });
    if (!entry || entry.memorialId !== params.memorialId) {
      return CommonErrors.notFound('Guest book entry');
    }

    await prisma.$transaction(async (tx) => {
      await tx.guestBookEntry.update({
        where: { id: params.entryId },
        data: { status: 'APPROVED' },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.GUEST_BOOK_ENTRY,
          entityId: params.entryId,
          action: AuditAction.APPROVE,
          actorId: userId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.MODERATION,
          metadata: { memorialId: params.memorialId },
        },
      });
    });

    return successResponse({ success: true });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    if (error && typeof error === 'object' && 'code' in error) {
      return handlePrismaError(error);
    }
    logError('POST guest-book approve', error);
    return CommonErrors.internal();
  }
}
