import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/memory/[memoryId]/unapprove
 *
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 * Sends an approved memory back to PENDING. Useful for removing content
 * from the public page without rejecting it.
 *
 * Phase 6
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; memoryId: string }> }
) {
  const { memorialId, memoryId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await assertMemorialAccess(memorialId, userId, 'edit');

    const memory = await prisma.memory.findUnique({
      where: { id: memoryId },
      select: { id: true, memorialId: true, status: true },
    });

    if (!memory || memory.memorialId !== memorialId) {
      return NextResponse.json({ success: false, error: 'Memory not found' }, { status: 404 });
    }

    if (memory.status !== MemoryStatus.APPROVED) {
      return NextResponse.json(
        { success: false, error: 'Memory is not currently approved' },
        { status: 400 }
      );
    }

    await prisma.memory.update({
      where: { id: memoryId },
      data: { status: MemoryStatus.PENDING },
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[POST /api/memorial/[memorialId]/memory/[memoryId]/unapprove]', error);
    return NextResponse.json({ success: false, error: 'Failed to unapprove memory' }, { status: 500 });
  }
}
