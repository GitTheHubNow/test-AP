// app/api/family-access/[memorialId]/visibility/route.ts
//
// Hide/show the whole memorial. "Hide" is exactly the same operation as
// the funeral-home archive button (lib/memorial/archiveDecision.ts) —
// same content-preserving, sealed-blocking semantics — just reached
// through the family session instead of assertMemorialAccess.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertFamilyAccess, FamilyAccessError } from '@/lib/familyAccess';
import { decideArchiveAction } from '@/lib/memorial/archiveDecision';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    await assertFamilyAccess(memorialId);

    const body: { visible?: boolean } = await request.json();
    if (typeof body.visible !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Missing visible flag' }, { status: 400 });
    }

    const memorial = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { sealed: true, status: true },
    });
    if (!memorial) {
      return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
    }

    if (body.visible) {
      // Show — the un-archive direction. Same sealed guard as hiding:
      // a sealed memorial's status is frozen either way.
      if (memorial.sealed) {
        return NextResponse.json({ success: false, error: 'This memorial is sealed and its visibility cannot be changed.' }, { status: 409 });
      }
      if (memorial.status === 'ACTIVE') {
        return NextResponse.json({ success: true, data: { status: 'ACTIVE' } });
      }
      await prisma.memorial.update({ where: { id: memorialId }, data: { status: 'ACTIVE' } });
      await prisma.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL, entityId: memorialId,
          action: AuditAction.RESTORE, actorId: `family-session:${memorialId}`,
          actorRole: ActorRole.FAMILY, reasonCode: ReasonCode.FAMILY_SELF_SERVICE,
          metadata: { newStatus: 'ACTIVE' },
        },
      });
      return NextResponse.json({ success: true, data: { status: 'ACTIVE' } });
    }

    // Hide — reuse the same tested decision the archive button uses.
    const decision = decideArchiveAction(memorial);
    if (decision.action === 'reject') {
      return NextResponse.json({ success: false, error: decision.reason }, { status: decision.status });
    }
    if (decision.action === 'noop') {
      return NextResponse.json({ success: true, data: { status: 'ARCHIVED' } });
    }

    await prisma.memorial.update({ where: { id: memorialId }, data: { status: 'ARCHIVED' } });
    await prisma.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL, entityId: memorialId,
        action: AuditAction.ARCHIVE, actorId: `family-session:${memorialId}`,
        actorRole: ActorRole.FAMILY, reasonCode: ReasonCode.FAMILY_SELF_SERVICE,
        metadata: { newStatus: 'ARCHIVED' },
      },
    });
    return NextResponse.json({ success: true, data: { status: 'ARCHIVED' } });

  } catch (error) {
    if (error instanceof FamilyAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[PATCH /api/family-access/[memorialId]/visibility]', error);
    return NextResponse.json({ success: false, error: 'Failed to update visibility' }, { status: 500 });
  }
}
