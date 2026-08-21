import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyMemorialIntegrity } from '@/lib/immutability';
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

  // FIXED: previously a manual ownerId check that blocked org staff.
  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch (err) {
    return handleAuthError(err);
  }

  const integrityCheck = await verifyMemorialIntegrity(memorialId);

  return NextResponse.json({
    valid: integrityCheck.valid,
    issues: integrityCheck.issues,
    details: {
      memorial: integrityCheck.memorial,
      memories: integrityCheck.memories,
    },
  });
}