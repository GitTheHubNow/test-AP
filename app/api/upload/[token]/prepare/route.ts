import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { type BulkFileInput } from '@/lib/bulk-upload';
import { prepareDirectUploads } from '@/lib/direct-upload';

const MAX_UPLOADS_PER_TOKEN = 200; // same abuse cap as POST /api/upload/[token]
const MAX_FILES_PER_RUN     = 30;  // matches PublicUploadForm

/**
 * POST /api/upload/[token]/prepare   (public — the link token is the credential)
 *
 * Direct-to-bucket step 1 for the family photo link. Photos only. The signed
 * URL is valid for exactly the declared byte length, so a link cannot be used
 * to push a bigger file into storage. See lib/direct-upload.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const limited = await checkRateLimit(request, `upload-prepare:${token}`, { max: 20, windowMs: 60 * 1000 });
  if (limited) return limited;

  const memorial = await prisma.memorial.findUnique({
    where:  { uploadLinkToken: token },
    select: {
      id: true, uploadLinkEnabled: true,
      _count: { select: { collectionItems: { where: { uploadedBy: { startsWith: 'public:' } } } } },
    },
  });
  if (!memorial || !memorial.uploadLinkEnabled) {
    return NextResponse.json({ success: false, error: 'Upload link not found or disabled' }, { status: 404 });
  }

  let body: { files?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES_PER_RUN) {
    return NextResponse.json({ success: false, error: `Choose between 1 and ${MAX_FILES_PER_RUN} photos` }, { status: 400 });
  }

  const inputs: BulkFileInput[] = files.map((f: any) => ({
    name: typeof f?.name === 'string' ? f.name : '',
    type: typeof f?.type === 'string' ? f.type : '',
    size: typeof f?.size === 'number' ? f.size : NaN,
  }));

  const result = await prepareDirectUploads({
    memorialId: memorial.id,
    files: inputs,
    allowedTypes: ['PHOTO'],
    maxAccept: Math.max(0, MAX_UPLOADS_PER_TOKEN - memorial._count.collectionItems),
  });
  // The public client never needs the storage numbers.
  return NextResponse.json({ success: true, data: { mode: result.mode, accepted: result.accepted, rejected: result.rejected } });
}
