import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMemorialReadLog, getMemorialReadStats } from '@/lib/auditRead';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. assertMemorialAccess
  // (lib/auth/getOrgForUser.ts) checks org membership + role, matching the
  // access control already used elsewhere (e.g. app/api/memorials/[id]/qr).
  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch (err) {
    return handleAuthError(err);
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '100');

  const [readLog, stats] = await Promise.all([
    getMemorialReadLog(memorialId, limit),
    getMemorialReadStats(memorialId),
  ]);

  return NextResponse.json({
    stats,
    accessLog: readLog,
  });
}