// app/api/memorial/[memorialId]/handover/family-access/route.ts
//
// Staff-only trigger (POST/DELETE below). The actual token-generation +
// email logic lives in lib/familyAccess.ts's grantFamilyAccess() so it
// can also run automatically at the moment a handover completes (see
// app/api/handover/accept/[token]/route.ts) — the existing completed-state
// UI tells staff "your access to manage it has ended" immediately on
// completion, which could mean this button is unreachable at exactly the
// moment it's needed if generation depended on a manual click alone.
// (Not defined in this file: Next.js's App Router rejects any named
// export from a route.ts file other than the HTTP method handlers.)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { grantFamilyAccess } from '@/lib/familyAccess';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const result = await grantFamilyAccess(memorialId, userId, ActorRole.FUNERAL_HOME);
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    data: { familyAccessToken: result.familyAccessToken, familyAccessUrl: `/family/${result.familyAccessToken}` },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const handover = await prisma.memorialHandover.findUnique({
    where:  { memorialId },
    select: { id: true },
  });
  if (!handover) {
    return NextResponse.json({ success: false, error: 'No handover exists for this memorial' }, { status: 404 });
  }

  // Revoking sets familyAccessRevokedAt rather than clearing the token —
  // assertFamilyAccess() checks this field on every single request, so
  // an already-issued cookie stops working immediately, not just for
  // future unlock attempts. The token itself stays in the row for audit
  // purposes rather than being deleted.
  await prisma.memorialHandover.update({
    where: { id: handover.id },
    data:  { familyAccessEnabled: false, familyAccessRevokedAt: new Date() },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: EntityType.MEMORIAL, entityId: memorialId,
      action:     AuditAction.UPDATE,
      actorId:    userId,
      actorRole:  ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.FAMILY_SELF_SERVICE,
      metadata:   { revokedFamilyAccess: true },
    },
  });

  return NextResponse.json({ success: true });
}
