import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus, MediaStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/memory/[memoryId]/approve-with-media
 *
 * Approve a memory and all its attached media in one action.
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 *
 * ✅ Phase 2A: Photo Upload System
 * ✅ Gaps fix: clerkClient singleton deprecation removed (not needed here)
 */
export async function POST(
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

    await assertMemorialAccess(params.memorialId, userId, 'edit');

    const memory = await prisma.memory.findUnique({
      where:  { id: params.memoryId },
      select: { memorialId: true, status: true },
    });

    if (!memory || memory.memorialId !== params.memorialId) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.memory.update({
        where: { id: params.memoryId },
        data:  { status: MemoryStatus.APPROVED, rejectedAt: null, stale: false },
      }),
      prisma.media.updateMany({
        where: { memoryId: params.memoryId, status: MediaStatus.PENDING },
        data:  { status: MediaStatus.APPROVED, rejectedAt: null },
      }),
    ]);

    return NextResponse.json({ success: true });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[POST approve-with-media]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to approve memory and media' },
      { status: 500 }
    );
  }
}
