import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/memory/[memoryId]/visible-until
 *
 * Sets or clears the visibleUntil date on a memory.
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 *
 * Body: { visibleUntil: string | null }
 *   - ISO date string to set an expiry
 *   - null to remove expiry (memory visible indefinitely)
 *
 * Phase gaps fix
 */
export async function PATCH(
  request: NextRequest,
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
      where:  { id: memoryId },
      select: { memorialId: true },
    });

    if (!memory || memory.memorialId !== memorialId) {
      return NextResponse.json({ success: false, error: 'Memory not found' }, { status: 404 });
    }

    const body = await request.json();
    const { visibleUntil } = body as { visibleUntil: string | null };

    // Validate — must be null or a valid future-ish date
    let parsedDate: Date | null = null;
    if (visibleUntil !== null && visibleUntil !== undefined) {
      parsedDate = new Date(visibleUntil);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid date' }, { status: 400 });
      }
    }

    await prisma.memory.update({
      where: { id: memoryId },
      data:  { visibleUntil: parsedDate },
    });

    return NextResponse.json({ success: true, data: { visibleUntil: parsedDate } });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH visible-until]', error);
    return NextResponse.json({ success: false, error: 'Failed to update expiry' }, { status: 500 });
  }
}
