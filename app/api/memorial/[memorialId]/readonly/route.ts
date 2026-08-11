import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { parseBody, validateParam, MemorialIdSchema, ToggleReadOnlySchema } from '@/lib/validation';
import { CommonErrors, successResponse, logError, handlePrismaError, handleAuthError } from '@/lib/errors';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

export async function POST(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return CommonErrors.unauthorized();

    // Validate param
    const idValidation = validateParam(params.memorialId, MemorialIdSchema);
    if (!idValidation.success) return CommonErrors.badRequest(idValidation.error);

    // Validate body
    const bodyValidation = await parseBody(request, ToggleReadOnlySchema);
    if (!bodyValidation.success) return CommonErrors.badRequest(bodyValidation.error);

    // Check org-scoped access BEFORE update — previously a manual
    // ownerId check that blocked org staff.
    await assertMemorialAccess(params.memorialId, userId, 'edit');

    // Update
    await prisma.memorial.update({
      where: { id: params.memorialId },
      data: { readOnly: bodyValidation.data.readOnly },
    });

    return successResponse({ success: true });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    if (error && typeof error === 'object' && 'code' in error) {
      return handlePrismaError(error);
    }
    logError('POST readonly', error);
    return CommonErrors.internal();
  }
}