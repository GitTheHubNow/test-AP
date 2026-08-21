import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/photos/[photoId]
 *
 * Update a single collection item's photo manager fields.
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 * Accepts any subset of: status, forTribute, forMemorial, isHero, caption
 *
 * When isHero=true, clears isHero on all other items for this memorial.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; photoId: string }> }
) {
  const { memorialId, photoId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  // No outer try/catch in this file (only the transaction below is
  // wrapped) — assertMemorialAccess throws, so catch it right here rather
  // than letting it become an unhandled rejection.
  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const item = await prisma.collectionItem.findUnique({
    where:  { id: photoId },
    select: { id: true, memorialId: true },
  });

  if (!item || item.memorialId !== memorialId) {
    return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 });
  }

  let body: {
    status?:      string;
    forTribute?:  boolean;
    forMemorial?: boolean;
    isHero?:      boolean;
    caption?:     string | null;
    tributeOrder?: number | null;
    tributeDuration?: number | null;
  };

  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  try {
    await prisma.$transaction(async (tx) => {
      // If setting isHero, clear all others first
      if (body.isHero === true) {
        await tx.collectionItem.updateMany({
          where: { memorialId: memorialId, isHero: true },
          data:  { isHero: false },
        });
        // Also update hero image key on memorial
      }

      await tx.collectionItem.update({
        where: { id: photoId },
        data: {
          ...(body.status      !== undefined ? { status:      body.status      as any } : {}),
          ...(body.forTribute  !== undefined ? { forTribute:  body.forTribute  } : {}),
          ...(body.forMemorial !== undefined ? { forMemorial: body.forMemorial } : {}),
          ...(body.isHero      !== undefined ? { isHero:      body.isHero      } : {}),
          ...(body.caption     !== undefined ? { caption:     body.caption     } : {}),
          ...(body.tributeOrder   !== undefined ? { tributeOrder:   body.tributeOrder   } : {}),
          ...(body.tributeDuration !== undefined ? { tributeDuration: body.tributeDuration } : {}),
          reviewedBy: userId,
          reviewedAt: new Date(),
        },
      });

      // Sync hero image key on memorial
      if (body.isHero === true) {
        const photo = await tx.collectionItem.findUnique({
          where:  { id: photoId },
          select: { blobKey: true },
        });
        if (photo?.blobKey) {
          await tx.memorial.update({
            where: { id: memorialId },
            data:  { heroImageKey: photo.blobKey },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH photos/[photoId]]', error);
    return NextResponse.json({ success: false, error: 'Failed to update photo' }, { status: 500 });
  }
}
