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

    // Validate both params
    const memorialValidation = validateParam(memorialId, MemorialIdSchema);
    if (!memorialValidation.success) return CommonErrors.badRequest(memorialValidation.error);

    const memoryValidation = validateParam(memoryId, MemoryIdSchema);
    if (!memoryValidation.success) return CommonErrors.badRequest(memoryValidation.error);

    // Check org-scoped access and read-only
    await assertMemorialAccess(memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { readOnly: true },
    });

    if (!memorial) return CommonErrors.notFound('Memorial');
    if (memorial.readOnly) return CommonErrors.badRequest('Memorial is read-only');

    // UPDATED: was a hand-rolled $transaction — now shared via
    // lib/approvals.ts's recordApproval(). rejectedAt is still set,
    // matching the original behaviour exactly (see approvals.ts).
    await recordApproval({
      entity:     'MEMORY',
      entityId:   memoryId,
      memorialId,
      decision:   'REJECTED',
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
    logError('POST reject', error);
    return CommonErrors.internal();
  }
}