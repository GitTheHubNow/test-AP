import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { prepareDirectUploads } from '@/lib/direct-upload';

/**
 * POST /api/memorial/[memorialId]/video/upload/prepare
 * Direct-to-bucket step 1 for the rendered tribute video (up to 200MB — far
 * beyond Vercel's ~4.5MB request body limit, which is why the old multipart
 * route could never have worked in production). Body: { name, type, size }.
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

  const limited = await checkRateLimit(request, `video-prepare:${userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  let b: any;
  try { b = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const result = await prepareDirectUploads({
    memorialId,
    files: [{
      name: typeof b?.name === 'string' ? b.name : 'tribute.mp4',
      type: typeof b?.type === 'string' ? b.type : 'video/mp4',
      size: typeof b?.size === 'number' ? b.size : NaN,
    }],
    allowedTypes: ['VIDEO'],
  });

  if (result.accepted.length === 0) {
    return NextResponse.json({ error: result.rejected[0]?.reason ?? 'Video not accepted' }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: { mode: result.mode, accepted: result.accepted, rejected: result.rejected } });
}
