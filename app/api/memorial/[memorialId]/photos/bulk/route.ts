import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/photos/bulk
 *
 * Bulk update photo manager fields on multiple CollectionItems.
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 *
 * Body: { ids: string[], ...fields }
 * Fields: status, forTribute, forMemorial
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  let body: {
    ids:          string[];
    status?:      string;
    forTribute?:  boolean;
    forMemorial?: boolean;
  };

  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ success: false, error: 'ids array required' }, { status: 400 });
  }

  // Verify all IDs belong to this memorial
  const count = await prisma.collectionItem.count({
    where: { id: { in: body.ids }, memorialId: memorialId },
  });

  if (count !== body.ids.length) {
    return NextResponse.json({ success: false, error: 'One or more photo IDs not found' }, { status: 404 });
  }

  try {
    await prisma.collectionItem.updateMany({
      where: { id: { in: body.ids }, memorialId: memorialId },
      data: {
        ...(body.status      !== undefined ? { status:      body.status      as any } : {}),
        ...(body.forTribute  !== undefined ? { forTribute:  body.forTribute  } : {}),
        ...(body.forMemorial !== undefined ? { forMemorial: body.forMemorial } : {}),
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: { updated: body.ids.length } });
  } catch (error) {
    console.error('[PATCH photos/bulk]', error);
    return NextResponse.json({ success: false, error: 'Failed to bulk update' }, { status: 500 });
  }
}
