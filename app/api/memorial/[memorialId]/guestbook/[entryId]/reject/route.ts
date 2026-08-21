import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError, handleAuthError } from '@/lib/errors';
import { validateParam, MemorialIdSchema, GuestBookIdSchema } from '@/lib/validation';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

/**
 * POST /api/memorial/[memorialId]/guest-book/[entryId]/reject
 *
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check — fixed to use assertMemorialAccess). Rejects a pending guest
 * book entry — it will not appear on the public memorial page. Mirrors
 * the memory reject route's shape.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; entryId: string }> }
) {
  const { memorialId, entryId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) return CommonErrors.unauthorized();

    const memorialValidation = validateParam(memorialId, MemorialIdSchema);
    if (!memorialValidation.success) return CommonErrors.badRequest(memorialValidation.error);

    const entryValidation = validateParam(entryId, GuestBookIdSchema);
    if (!entryValidation.success) return CommonErrors.badRequest(entryValidation.error);

    await assertMemorialAccess(memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { readOnly: true },
    });

    if (!memorial) return CommonErrors.notFound('Memorial');
    if (memorial.readOnly) return CommonErrors.badRequest('Memorial is read-only');

    const entry = await prisma.guestBookEntry.findUnique({
      where: { id: entryId },
      select: { id: true, memorialId: true },
    });
    if (!entry || entry.memorialId !== memorialId) {
      return CommonErrors.notFound('Guest book entry');
    }

    await prisma.$transaction(async (tx) => {
      await tx.guestBookEntry.update({
        where: { id: entryId },
        data: { status: 'REJECTED' },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.GUEST_BOOK_ENTRY,
          entityId: entryId,
          action: AuditAction.REJECT,
          actorId: userId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.MODERATION,
          metadata: { memorialId: memorialId },
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
    logError('POST guest-book reject', error);
    return CommonErrors.internal();
  }
}
