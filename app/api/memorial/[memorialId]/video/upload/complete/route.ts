import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { directUploadsEnabled, verifyDirectUploads } from '@/lib/direct-upload';
import { getPublicUrl } from '@/lib/upload-shared';

/**
 * POST /api/memorial/[memorialId]/video/upload/complete
 * Direct-to-bucket step 2: verifies the uploaded video really landed (exists,
 * real size, MP4/MOV/WebM signature, storage cap — crediting the video it
 * replaces) and records it on the TributeVideo row, same as the old route.
 * Body: { key }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> },
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const limited = await checkRateLimit(request, `video-complete:${userId}`, { max: 40, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  if (!directUploadsEnabled()) {
    return NextResponse.json({ error: 'Direct upload is only used in production' }, { status: 400 });
  }

  let b: any;
  try { b = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const existing = await prisma.tributeVideo.findUnique({
    where: { memorialId }, select: { sizeBytes: true, webBlobKey: true },
  });

  // Re-render of the same key (retry): already saved.
  if (existing?.webBlobKey && existing.webBlobKey === b?.key) {
    return NextResponse.json({ url: getPublicUrl(existing.webBlobKey), blobKey: existing.webBlobKey });
  }

  const { saveable, failed } = await verifyDirectUploads({
    memorialId,
    raw: [{ key: b?.key, name: 'tribute.mp4', mimeType: typeof b?.mimeType === 'string' ? b.mimeType : 'video/mp4' }],
    allowedTypes: ['VIDEO'],
    creditBytes: existing?.sizeBytes ?? 0,
  });

  const v = saveable[0];
  if (!v) {
    return NextResponse.json({ error: failed[0]?.reason ?? 'Upload failed' }, { status: 400 });
  }

  try {
    await prisma.tributeVideo.upsert({
      where:  { memorialId },
      create: { memorialId, webBlobKey: v.key, hdBlobKey: v.key, sizeBytes: v.size, status: 'COMPLETE', renderedAt: new Date() },
      update: { webBlobKey: v.key, hdBlobKey: v.key, sizeBytes: v.size, status: 'COMPLETE', renderedAt: new Date() },
    });
  } catch (err) {
    console.error('[video/upload/complete]', err);
    const { deleteFile } = await import('@/lib/storage-server');
    await deleteFile(v.key).catch(() => {});
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({ url: getPublicUrl(v.key), blobKey: v.key });
}
