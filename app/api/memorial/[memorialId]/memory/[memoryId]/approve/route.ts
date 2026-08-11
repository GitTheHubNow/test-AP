import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError, handleAuthError } from '@/lib/errors';
import { validateParam, MemorialIdSchema, MemoryIdSchema } from '@/lib/validation';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

export async function POST(
  request: NextRequest,
  { params }: { params: { memorialId: string; memoryId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return CommonErrors.unauthorized();

    const memorialValidation = validateParam(params.memorialId, MemorialIdSchema);
    if (!memorialValidation.success) return CommonErrors.badRequest(memorialValidation.error);

    const memoryValidation = validateParam(params.memoryId, MemoryIdSchema);
    if (!memoryValidation.success) return CommonErrors.badRequest(memoryValidation.error);

    await assertMemorialAccess(params.memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: { readOnly: true },
    });

    if (!memorial) return CommonErrors.notFound('Memorial');
    if (memorial.readOnly) return CommonErrors.badRequest('Memorial is read-only');

    await prisma.$transaction(async (tx) => {
      await tx.memory.update({
        where: { id: params.memoryId },
        data: { status: 'APPROVED' },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY,
          entityId: params.memoryId,
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
    logError('POST approve', error);
    return CommonErrors.internal();
  }
}
