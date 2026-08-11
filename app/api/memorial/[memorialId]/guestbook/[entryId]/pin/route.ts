import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/guest-book/[entryId]/pin
 *
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check — fixed to use assertMemorialAccess). Toggles the pinned flag on
 * a guest book entry. Pinned entries float to the top of the public
 * guest book, same idea as the memory "featured" toggle — see
 * app/api/memorial/[memorialId]/memory/[memoryId]/featured/route.ts
 *
 * Body: { pinned: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { memorialId: string; entryId: string } }
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

    const entry = await prisma.guestBookEntry.findUnique({
      where: { id: params.entryId },
      select: { id: true, memorialId: true, pinned: true },
    });

    if (!entry || entry.memorialId !== params.memorialId) {
      return NextResponse.json(
        { success: false, error: 'Guest book entry not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { pinned } = body as { pinned: boolean };

    if (typeof pinned !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'pinned must be a boolean' },
        { status: 400 }
      );
    }

    const updated = await prisma.guestBookEntry.update({
      where: { id: params.entryId },
      data: { pinned },
      select: { id: true, pinned: true },
    });

    return NextResponse.json({
      success: true,
      data: { entry: updated },
    });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH /api/memorial/[memorialId]/guest-book/[entryId]/pin]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update pinned status' },
      { status: 500 }
    );
  }
}
