import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemorialStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * DELETE /api/memorial/[memorialId]/delete
 *
 * ⚠️ DEAD ROUTE — not called by anything in the app (re-confirmed during
 * the RBAC sweep below — still no callers). The real "Delete Memorial"
 * button (components/DeleteMemorialButton.tsx) calls
 * DELETE /api/memorial/[memorialId] instead (see that route's DELETE
 * handler), which already implements this correctly.
 *
 * This file originally referenced a `deletedAt` field that was never
 * added to the schema — it would have 500'd on every call. Fixed to
 * match the working route's logic (archive via MemorialStatus.ARCHIVED,
 * not a nonexistent timestamp column) rather than leaving a broken,
 * unsafe duplicate sitting in the codebase. Left in place, not deleted,
 * per the same "flag, don't remove" approach used for other dead files
 * found during the pre-launch audit — see ARCHITECTURE-HANDOVER notes.
 *
 * Org-scoped delete access via assertMemorialAccess (previously a manual
 * ownerId check that blocked org staff — fixed as part of the same sweep
 * that fixed app/api/memorial/[memorialId]/route.ts's DELETE handler,
 * the one route that actually matters here). Sealed memorials cannot be
 * archived — matches the working route's safety check.
 *
 * Phase 3A - Feature 5
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await assertMemorialAccess(params.memorialId, userId, 'delete');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: { sealed: true, status: true, title: true },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    if (memorial.sealed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sealed memorials cannot be deleted. This memorial is permanently preserved.',
        },
        { status: 403 }
      );
    }

    if (memorial.status === MemorialStatus.ARCHIVED) {
      return NextResponse.json({
        success: true,
        message: 'Memorial is already archived',
      });
    }

    await prisma.memorial.update({
      where: { id: params.memorialId },
      data: { status: MemorialStatus.ARCHIVED },
    });

    return NextResponse.json({
      success: true,
      message: `Memorial "${memorial.title}" has been archived`,
    });

  } catch (error) {
    // assertMemorialAccess throws with a .status (401/403/404) — surface
    // that correctly instead of masking it as a generic 500.
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[DELETE /api/memorial/[memorialId]/delete]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete memorial' },
      { status: 500 }
    );
  }
}
