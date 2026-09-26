import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveUploadedFile } from '@/lib/storage-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { verifyFileContent } from '@/lib/file-validation';
import { assertStorageQuotaAvailable } from '@/lib/storage-quota';

const MAX_FILES_PER_REQUEST = 1; // One at a time from the client
const MAX_FILE_SIZE_BYTES   = 50 * 1024 * 1024; // 50MB
const MAX_UPLOADS_PER_TOKEN = 200; // Abuse limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * GET /api/upload/[token]
 * Validate token — returns memorial info for the page render.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const memorial = await prisma.memorial.findUnique({
    where:  { uploadLinkToken: token },
    select: {
      id:               true,
      title:            true,
      firstName:        true,
      lastName:         true,
      preferredName:    true,
      funeralDate:      true,
      uploadLinkEnabled: true,
    },
  });

  if (!memorial || !memorial.uploadLinkEnabled) {
    return NextResponse.json({ success: false, error: 'Upload link not found or disabled', code: 'INVALID' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { memorial } });
}

/**
 * POST /api/upload/[token]
 * Upload a single photo. No authentication required — token is the key.
 * 
 * Body: multipart/form-data
 *   file         — required, image file
 *   uploaderName  — optional
 *   uploaderEmail — optional
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // No auth on this route by design — the upload token IS the
  // credential (family members use it with no account). It had no
  // rate limiting at all though, unlike every other public write
  // endpoint in this app (memorial-access/unlock, guest-book, etc.) —
  // MAX_UPLOADS_PER_TOKEN caps total volume but nothing stopped a
  // client from burning through that cap in a rapid burst, each one
  // still doing a DB lookup + S3 write before being rejected.
  const limited = await checkRateLimit(request, `upload:${token}`, { max: 20, windowMs: 60 * 1000 });
  if (limited) return limited;

  // Validate token
  const memorial = await prisma.memorial.findUnique({
    where:  { uploadLinkToken: token },
    select: {
      id:               true,
      uploadLinkEnabled: true,
      _count: {
        select: {
          collectionItems: {
            where: { uploadedBy: { startsWith: 'public:' } }
          }
        }
      }
    },
  });

  if (!memorial || !memorial.uploadLinkEnabled) {
    return NextResponse.json({ success: false, error: 'Upload link not found or disabled' }, { status: 404 });
  }

  // Abuse limit
  if (memorial._count.collectionItems >= MAX_UPLOADS_PER_TOKEN) {
    return NextResponse.json({ success: false, error: 'Upload limit reached for this link' }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }

  const file         = formData.get('file') as File | null;
  const uploaderName  = (formData.get('uploaderName')  as string | null)?.trim() || null;
  const uploaderEmail = (formData.get('uploaderEmail') as string | null)?.trim() || null;

  if (!file) {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
  }

  // Validate file type — check declared type and extension
  const lowerName = file.name.toLowerCase();
  const isHeic    = lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
  const validType = ALLOWED_TYPES.includes(file.type) || isHeic;
  if (!validType) {
    return NextResponse.json({ success: false, error: `File type not supported: ${file.type}` }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ success: false, error: `File too large. Maximum is 50MB.` }, { status: 400 });
  }

  // Magic-byte check — verify the file's actual content matches its
  // declared type, rather than trusting the client-supplied
  // Content-Type header alone. Was missing here even though the
  // sibling api/collect/[token]/route.ts already does this — see
  // lib/file-validation.ts for why it matters: uploads are served
  // directly by URL (via S3 in production, public/uploads/** in dev),
  // so a mislabeled file is a stored XSS risk against anyone who opens
  // the link, not just a data-integrity issue.
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentCheck = verifyFileContent(buffer, isHeic ? 'image/heic' : file.type);
  if (!contentCheck.valid) {
    return NextResponse.json({ success: false, error: contentCheck.reason }, { status: 400 });
  }

  // Cumulative per-memorial storage quota — checked after the individual
  // per-file size cap above, same ordering as the video upload route:
  // reject obviously-too-big files cheaply first, then do the DB read
  // needed for the cumulative check.
  try {
    await assertStorageQuotaAvailable(memorial.id, file.size);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status ?? 413 });
  }

  try {
    // Save file to storage
    const blobKey = await saveUploadedFile(file, `memorials/${memorial.id}/uploads`);

    // Create CollectionItem
    const item = await prisma.collectionItem.create({
      data: {
        memorialId:   memorial.id,
        uploadedBy:   `public:${token}`,
        uploaderRole: 'PUBLIC',
        type:         'PHOTO',
        status:       'UNSORTED',
        blobKey,
        mimeType:     isHeic ? 'image/heic' : file.type,
        sizeBytes:    file.size,
        title:        file.name,
        uploaderName,
        uploaderEmail,
        forTribute:   false,
        forMemorial:  false,
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ success: true, data: { itemId: item.id } }, { status: 201 });

  } catch (error) {
    console.error('[POST /api/upload/[token]]', error);
    return NextResponse.json({ success: false, error: 'Failed to upload photo' }, { status: 500 });
  }
}
