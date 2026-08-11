import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/memory/[memoryId]/featured
 *
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 * Toggles the featured flag on a memory. Featured memories float to the
 * top of the public memorial page.
 *
 * Body: { featured: boolean }
 *
 * Phase 4B
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { memorialId: string; memoryId: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify org-scoped access
    await assertMemorialAccess(params.memorialId, userId, 'edit');

    // Verify memory belongs to this memorial
    const memory = await prisma.memory.findUnique({
      where: { id: params.memoryId },
      select: { id: true, memorialId: true, featured: true },
    });

    if (!memory || memory.memorialId !== params.memorialId) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      );
    }

    // Parse body
    const body = await request.json();
    const { featured } = body as { featured: boolean };

    if (typeof featured !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'featured must be a boolean' },
        { status: 400 }
      );
    }

    // Update
    const updated = await prisma.memory.update({
      where: { id: params.memoryId },
      data: { featured },
      select: { id: true, featured: true },
    });

    return NextResponse.json({
      success: true,
      data: { memory: updated },
    });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH /api/memorial/[memorialId]/memory/[memoryId]/featured]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update featured status' },
      { status: 500 }
    );
  }
}
