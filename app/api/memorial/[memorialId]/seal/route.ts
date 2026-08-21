import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { sealMemorial } from '@/lib/immutability';
import { ActorRole } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

export async function POST(
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

  // Org-scoped edit access — previously a manual ownerId check that
  // blocked org staff.
  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const memorial = await prisma.memorial.findUnique({
    where: { id: memorialId },
    select: { sealed: true },
  });

  if (!memorial) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  }

  if (memorial.sealed) {
    return NextResponse.json(
      { error: 'Memorial already sealed' },
      { status: 400 }
    );
  }

  try {
    await sealMemorial(memorialId, userId, ActorRole.FUNERAL_HOME);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to seal memorial' },
      { status: 500 }
    );
  }
}