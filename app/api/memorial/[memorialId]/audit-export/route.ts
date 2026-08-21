import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateEntityAuditExport } from '@/lib/compliance';
import { EntityType } from '@/lib/audit';
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

  try {
    const auditExport = await generateEntityAuditExport(
      EntityType.MEMORIAL,
      memorialId
    );

    return new NextResponse(JSON.stringify(auditExport, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="memorial-${memorialId}-audit.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to export audit trail' },
      { status: 500 }
    );
  }
}