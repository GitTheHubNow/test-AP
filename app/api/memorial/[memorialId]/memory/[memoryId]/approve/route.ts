import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError, handleAuthError } from '@/lib/errors';
import { validateParam, MemorialIdSchema, MemoryIdSchema } from '@/lib/validation';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { recordApproval } from '@/lib/approvals';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; memoryId: string }> }
) {
  const { memorialId, memoryId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) return CommonErrors.unauthorized();

    const memorialValidation = validateParam(memorialId, MemorialIdSchema);
    if (!memorialValidation.success) return CommonErrors.badRequest(memorialValidation.error);

    const memoryValidation = validateParam(memoryId, MemoryIdSchema);
    if (!memoryValidation.success) return CommonErrors.badRequest(memoryValidation.error);

    await assertMemorialAccess(memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { readOnly: true },
    });

    if (!memorial) return CommonErrors.notFound('Memorial');
    if (memorial.readOnly) return CommonErrors.badRequest('Memorial is read-only');

    // UPDATED: was a hand-rolled $transaction (status update + AuditEvent
    // create) — now shared via lib/approvals.ts's recordApproval(), same
    // behaviour, consistent with the other 3 approve/reject routes.
    await recordApproval({
      entity:     'MEMORY',
      entityId:   memoryId,
      memorialId,
      decision:   'APPROVED',
      reviewedBy: userId,
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
