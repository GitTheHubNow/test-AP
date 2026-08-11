// app/api/memorials/[id]/slideshow/route.ts
//
// GET /api/memorials/[id]/slideshow
// Returns approved forTribute photos (ordered) + linked music track.
// Protected: Clerk session required + featureSlideshow flag.
//
// V2 auth pattern: assertMemorialAccess (org-aware) + assertFeatureEnabled.
// Follows the same shape as /api/memorials/[id]/qr/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { assertMemorialAccess }       from '@/lib/tenant';
import { getPublicUrl }               from '@/lib/upload-shared';

// Re-use the same feature-flag guard introduced in Phase 1.
// assertFeatureEnabled(userId, 'slideshow') throws a 403 Response
// if Organisation.featureSlideshow is false for the user's org.
import { assertFeatureEnabled } from '@/lib/tenant';
import { handleAuthError } from '@/lib/errors';

function toProxyUrl(blobKey: string): string {
  if (blobKey.startsWith('http://') || blobKey.startsWith('https://')) {
    return `/api/music/proxy?url=${encodeURIComponent(blobKey)}`;
  }
  return blobKey.startsWith('/') ? blobKey : `/${blobKey}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    // Org-aware ownership check (same as QR route).
    // Returns the memorial row or throws a 403/404 Response.
    const memorial = await assertMemorialAccess(params.id, userId);
    if (!memorial) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Feature flag guard — throws 403 Response if featureSlideshow = false.
    await assertFeatureEnabled(userId, 'slideshow');

    // Approved photos marked for tribute, in order.
    const photos = await prisma.collectionItem.findMany({
      where: {
        memorialId: params.id,
        type:       'PHOTO',
        forTribute: true,
        status:     'APPROVED',
      },
      orderBy: [{ tributeOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id:              true,
        blobKey:         true,
        caption:         true,
        tributeOrder:    true,
        tributeDuration: true,
        uploaderName:    true,
      },
    });

    // Music track linked via TributeVideo (reuse existing config — no new fields).
    const tributeVideo = await prisma.tributeVideo.findUnique({
      where:  { memorialId: params.id },
      select: {
        musicTrackId:  true,
        titleCardText: true,
        endCardText:   true,
        musicTrack: {
          select: {
            id:              true,
            title:           true,
            artist:          true,
            durationSeconds: true,
            blobKey:         true,
            previewBlobKey:  true,
          },
        },
      },
    });

    const track = tributeVideo?.musicTrack ?? null;

    return NextResponse.json({
      success: true,
      data: {
        photos: photos.map(p => ({
          id:              p.id,
          url:             p.blobKey ? getPublicUrl(p.blobKey) : null,
          caption:         p.caption         ?? null,
          tributeOrder:    p.tributeOrder     ?? null,
          // tributeDuration: seconds this photo displays. null = use default (5s).
          tributeDuration: p.tributeDuration  ?? null,
          uploaderName:    p.uploaderName     ?? null,
        })),
        music: track
          ? {
              id:              track.id,
              title:           track.title,
              artist:          track.artist ?? null,
              durationSeconds: track.durationSeconds,
              // Full track (not preview) goes through proxy to bypass COEP.
              audioUrl: toProxyUrl(track.blobKey),
            }
          : null,
        titleCardText: tributeVideo?.titleCardText ?? null,
        endCardText:   tributeVideo?.endCardText   ?? null,
      },
    });

  } catch (err: any) {
    // assertMemorialAccess / assertFeatureEnabled throw a plain Error with
    // a .status property attached, not a Response instance — the old
    // `err instanceof Response` check here never matched, so every 403
    // from a disabled feature flag was previously masked as a 500.
    return handleAuthError(err);
  }
}
