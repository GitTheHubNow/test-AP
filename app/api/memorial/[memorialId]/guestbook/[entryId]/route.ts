import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError, handleAuthError } from '@/lib/errors';
import { validateParam, MemorialIdSchema, GuestBookIdSchema } from '@/lib/validation';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

/**
 * DELETE /api/memorial/[memorialId]/guest-book/[entryId]
 *
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 * Permanently deletes a guest book entry — distinct from reject, which
 * just hides it. Use for spam or content that shouldn't be retained at
 * all (reject is the reversible, softer action).
 */
export async function DELETE(
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
      // Audit event first, referencing the entry — deleting after write
      // keeps the audit row's entityId meaningful even once the entry
      // itself is gone. Same order as no delete elsewhere in this app
      // (memories are never hard-deleted, only rejected), so this is a
      // genuinely new pattern — flagging in case you'd rather soft-delete
      // instead. For now this is a real hard delete.
      await tx.auditEvent.create({
        data: {
          entityType: EntityType.GUEST_BOOK_ENTRY,
          entityId: entryId,
          action: AuditAction.DELETE,
          actorId: userId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.DELETION,
          metadata: { memorialId: memorialId },
        },
      });

      await tx.guestBookEntry.delete({
        where: { id: entryId },
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
    logError('DELETE guest-book entry', error);
    return CommonErrors.internal();
  }
}
