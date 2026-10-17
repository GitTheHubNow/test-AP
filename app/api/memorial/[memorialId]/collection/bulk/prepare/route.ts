import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { BULK_LIMITS, type BulkFileInput } from '@/lib/bulk-upload';
import { prepareDirectUploads } from '@/lib/direct-upload';

/**
 * POST /api/memorial/[memorialId]/collection/bulk/prepare
 *
 * Step 1 of a staff upload (bulk, or the single-file form). Client sends file
 * METADATA only ({ name, type, size }[]); the server applies the type /
 * per-file / 5GB-per-memorial rules and returns presigned PUT URLs so the
 * browser can send bytes straight to R2 (see lib/direct-upload.ts for why).
 * Nothing is recorded here — …/bulk/complete does that after verifying.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> },
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const limited = await checkRateLimit(request, `bulk-prepare:${userId}`, { max: 60, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  let body: { files?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
  }
  if (files.length > BULK_LIMITS.maxFilesPerBatch) {
    return NextResponse.json({ success: false, error: `Up to ${BULK_LIMITS.maxFilesPerBatch} files per upload run` }, { status: 400 });
  }

  const inputs: BulkFileInput[] = files.map((f: any) => ({
    name: typeof f?.name === 'string' ? f.name : '',
    type: typeof f?.type === 'string' ? f.type : '',
    size: typeof f?.size === 'number' ? f.size : NaN,
  }));

  const result = await prepareDirectUploads({ memorialId, files: inputs });
  return NextResponse.json({ success: true, data: result });
}
