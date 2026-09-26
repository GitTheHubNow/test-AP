// app/api/family-access/[memorialId]/hide-comment/route.ts
//
// Toggles familyHidden on a Memory or GuestBookEntry. This is deliberately
// NOT the same as approve/reject — those are the funeral home's
// moderation decision (visible to the public at all) and stay entirely
// off-limits here. This only ever flips the family's own display
// preference on top of whatever the funeral home already approved.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertFamilyAccess, FamilyAccessError } from '@/lib/familyAccess';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    await assertFamilyAccess(memorialId);

    const body: { type?: 'memory' | 'guestbook'; id?: string; hidden?: boolean } = await request.json();
    const { type, id, hidden } = body;

    if (!type || !id || typeof hidden !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Missing type, id, or hidden' }, { status: 400 });
    }
    if (type !== 'memory' && type !== 'guestbook') {
      return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }

    if (type === 'memory') {
      // Scoping the WHERE to memorialId as well as id, not just id alone
      // — this is what actually stops a family session valid for
      // memorial A from hiding a comment on memorial B by supplying that
      // comment's id in the request body. If the row doesn't belong to
      // this memorial, count is 0 and nothing happens, rather than a
      // separate row belonging to someone else silently updating.
      const result = await prisma.memory.updateMany({
        where: { id, memorialId },
        data:  { familyHidden: hidden },
      });
      if (result.count === 0) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
      }
    } else {
      const result = await prisma.guestBookEntry.updateMany({
        where: { id, memorialId },
        data:  { familyHidden: hidden },
      });
      if (result.count === 0) {
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
      }
    }

    await prisma.auditEvent.create({
      data: {
        entityType: type === 'memory' ? EntityType.MEMORY : EntityType.GUEST_BOOK_ENTRY,
        entityId:   id,
        action:     hidden ? AuditAction.ARCHIVE : AuditAction.RESTORE,
        actorId:    `family-session:${memorialId}`,
        actorRole:  ActorRole.FAMILY,
        reasonCode: ReasonCode.FAMILY_SELF_SERVICE,
        metadata:   { memorialId, hidden },
      },
    });

    return NextResponse.json({ success: true, data: { id, hidden } });

  } catch (error) {
    if (error instanceof FamilyAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[PATCH /api/family-access/[memorialId]/hide-comment]', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
