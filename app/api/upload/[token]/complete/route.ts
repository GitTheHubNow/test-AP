import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { isValidEmail } from '@/lib/memorial/validateInput';
import { titleFromFileName } from '@/lib/bulk-upload';
import { directUploadsEnabled, verifyDirectUploads } from '@/lib/direct-upload';

const MAX_FILES_PER_RUN = 30;

/**
 * POST /api/upload/[token]/complete   (public — the link token is the credential)
 *
 * Direct-to-bucket step 2 for the family photo link: verifies what landed
 * (exists, real size, magic bytes, storage cap — deleting anything bad) and
 * records the photos as UNSORTED, PUBLIC-role CollectionItems, exactly like
 * the old multipart route did.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const limited = await checkRateLimit(request, `upload-complete:${token}`, { max: 20, windowMs: 60 * 1000 });
  if (limited) return limited;

  if (!directUploadsEnabled()) {
    return NextResponse.json({ success: false, error: 'Direct upload is only used in production' }, { status: 400 });
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { uploadLinkToken: token },
    select: { id: true, uploadLinkEnabled: true },
  });
  if (!memorial || !memorial.uploadLinkEnabled) {
    return NextResponse.json({ success: false, error: 'Upload link not found or disabled' }, { status: 404 });
  }

  let body: { items?: unknown; uploaderName?: unknown; uploaderEmail?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
  const raw = body?.items;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILES_PER_RUN) {
    return NextResponse.json({ success: false, error: 'Invalid items' }, { status: 400 });
  }

  const uploaderName  = typeof body.uploaderName === 'string' ? body.uploaderName.trim().slice(0, 100) || null : null;
  const emailRaw      = typeof body.uploaderEmail === 'string' ? body.uploaderEmail.trim() : '';
  const uploaderEmail = emailRaw && isValidEmail(emailRaw) ? emailRaw : null;

  const { saveable, failed, alreadyRecorded } = await verifyDirectUploads({
    memorialId: memorial.id, raw, allowedTypes: ['PHOTO'],
  });

  let uploaded = 0;
  if (saveable.length > 0) {
    try {
      await prisma.collectionItem.createMany({
        data: saveable.map((v) => ({
          memorialId:   memorial.id,
          uploadedBy:   `public:${token}`,
          uploaderRole: 'PUBLIC',
          type:         'PHOTO' as const,
          status:       'UNSORTED' as const,
          blobKey:      v.key,
          mimeType:     v.mimeType,
          sizeBytes:    v.size,
          title:        titleFromFileName(v.name),
          uploaderName,
          uploaderEmail,
          forTribute:   false,
          forMemorial:  false,
        })),
      });
      uploaded = saveable.length;
    } catch (error) {
      console.error('[POST /api/upload/[token]/complete]', error);
      const { deleteFile } = await import('@/lib/storage-server');
      await Promise.all(saveable.map((v) => deleteFile(v.key).catch(() => {})));
      return NextResponse.json({ success: false, error: 'Failed to save photos' }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    data: { uploaded, failed, alreadyRecorded: alreadyRecorded.size },
  }, { status: 201 });
}
