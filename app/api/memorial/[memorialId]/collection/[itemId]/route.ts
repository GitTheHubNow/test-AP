import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CollectionItemStatus, MemoryCategory, MemoryStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { deleteFile } from '@/lib/storage-server';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * PATCH /api/memorial/[memorialId]/collection/[itemId]
 *
 * Update a collection item — edit metadata, change status, mark ready.
 * Org-scoped edit access (previously a manual ownerId check that blocked
 * org staff — fixed to use assertMemorialAccess).
 *
 * Body (all optional):
 *   status         — UNSORTED | READY | APPROVED | REJECTED
 *   title
 *   description
 *   category
 *   showPublicly
 *   featured
 *   sortOrder
 *   rejectionReason — required when status = REJECTED
 *
 * When status = APPROVED: automatically creates a public Memory from this item.
 *
 * ✅ Phase 11b / 12a
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; itemId: string }> }
) {
  const { memorialId, itemId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const item = await prisma.collectionItem.findUnique({
    where:  { id: itemId },
    select: { id: true, memorialId: true, status: true, type: true, blobKey: true, promotedMemory: { select: { id: true } } },
  });

  if (!item || item.memorialId !== memorialId) {
    return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Build update payload
  const update: Record<string, unknown> = {};

  if (body.title       !== undefined) update.title       = (body.title as string)?.trim() || null;
  if (body.description !== undefined) update.description = (body.description as string)?.trim() || null;
  if (body.showPublicly !== undefined) update.showPublicly = Boolean(body.showPublicly);
  if (body.featured    !== undefined) update.featured    = Boolean(body.featured);
  if (body.sortOrder   !== undefined) update.sortOrder   = Number(body.sortOrder);

  if (body.category !== undefined) {
    const cat = body.category as string;
    update.category = cat && Object.values(MemoryCategory).includes(cat as MemoryCategory) ? cat : null;
  }

  const newStatus = body.status as CollectionItemStatus | undefined;
  let promoted = false;

  if (newStatus && newStatus !== item.status) {
    if (!Object.values(CollectionItemStatus).includes(newStatus)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    // rejectionReason is optional — the UI's own label says so
    // ("Reason for rejection (optional)"), but this route used to
    // require it anyway, so every reject click with an empty reason
    // field 400'd. Fixed to match what the UI actually promises: only
    // store a reason if one was actually provided.

    update.status     = newStatus;
    update.reviewedBy = userId;
    update.reviewedAt = new Date();

    if (newStatus === CollectionItemStatus.REJECTED && body.rejectionReason) {
      update.rejectionReason = (body.rejectionReason as string).trim();
    }

    // APPROVE — promote to a public Memory
    if (newStatus === CollectionItemStatus.APPROVED && item.promotedMemory.length === 0) {
      promoted = true;
    }
  }

  if (body.rejectionReason !== undefined && newStatus !== CollectionItemStatus.REJECTED) {
    update.rejectionReason = (body.rejectionReason as string)?.trim() || null;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Update the collection item
      const updated = await tx.collectionItem.update({
        where: { id: item.id },
        data:  update,
      });

      // If approving — create a public Memory from this item
      let memory = null;
      if (promoted) {
        const collectionItem = await tx.collectionItem.findUnique({
          where:  { id: item.id },
          select: { title: true, description: true, category: true, blobKey: true, mimeType: true, sizeBytes: true, featured: true, uploaderRole: true },
        });

        if (collectionItem) {
          // Build the message from title + description
          const message = [collectionItem.title, collectionItem.description].filter(Boolean).join('\n\n') || '(No message)';

          memory = await tx.memory.create({
            data: {
              memorialId:      memorialId,
              authorName:      collectionItem.uploaderRole === 'FAMILY' ? 'Family' : null,
              message,
              status:          MemoryStatus.APPROVED,
              category:        collectionItem.category ?? 'GENERAL',
              featured:        collectionItem.featured,
              collectionItemId: item.id,
            },
          });

          // If item has a file, promote the media too
          if (collectionItem.blobKey && collectionItem.mimeType) {
            await tx.media.create({
              data: {
                memorialId: memorialId,
                memoryId:   memory.id,
                blobKey:    collectionItem.blobKey,
                mimeType:   collectionItem.mimeType,
                sizeBytes:  collectionItem.sizeBytes ?? 0,
                status:     'APPROVED',
              },
            });
          }

          // Link promotedMemoryId back on the item
          await tx.collectionItem.update({
            where: { id: item.id },
            data:  { promotedMemoryId: memory.id },
          });
        }
      }

      // Audit log
      //
      // NOTE: this route is NOT migrated to lib/approvals.ts's
      // recordApproval() like the other 3 approve/reject routes are —
      // unlike those, a single PATCH here can simultaneously edit
      // metadata, change status, AND auto-promote to a public Memory
      // (+ Media) in one transaction with one combined audit event.
      // Forcing that through a generic single-entity approval function
      // would mean either losing the combined event or writing two
      // separate audit events for what's really one logical action —
      // worse, not better. The one real inconsistency here (this route
      // used AuditAction.UPDATE for approve/reject, while every other
      // route correctly used APPROVE/REJECT) is fixed directly below
      // instead.
      await tx.auditEvent.create({
        data: {
          entityType: EntityType.COLLECTION_ITEM,
          entityId:   item.id,
          action:     newStatus === CollectionItemStatus.APPROVED
            ? AuditAction.APPROVE
            : newStatus === CollectionItemStatus.REJECTED
              ? AuditAction.REJECT
              : AuditAction.UPDATE,
          actorId:    userId,
          actorRole:  ActorRole.OWNER,
          reasonCode: newStatus === CollectionItemStatus.APPROVED
            ? ReasonCode.APPROVAL
            : newStatus === CollectionItemStatus.REJECTED
              ? ReasonCode.REJECTION
              : ReasonCode.EDIT,
          metadata: {
            memorialId:  memorialId,
            newStatus,
            promoted,
            promotedMemoryId: memory?.id ?? null,
          },
        },
      });

      return { updated, memory };
    });

    return NextResponse.json({
      success: true,
      data: {
        item:   result.updated,
        memory: result.memory ? { id: result.memory.id } : null,
      },
    });

  } catch (error) {
    console.error('[PATCH /api/memorial/[id]/collection/[itemId]]', error);
    return NextResponse.json({ success: false, error: 'Failed to update item' }, { status: 500 });
  }
}

/**
 * DELETE /api/memorial/[memorialId]/collection/[itemId]
 *
 * Hard-delete a collection item and its file from disk.
 * Org-scoped delete access (previously a manual ownerId check that
 * blocked org staff — fixed to use assertMemorialAccess).
 * Only allowed if item is UNSORTED or REJECTED (not already approved/promoted).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; itemId: string }> }
) {
  const { memorialId, itemId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'delete');
  } catch (err) {
    return handleAuthError(err);
  }

  const item = await prisma.collectionItem.findUnique({
    where:  { id: itemId },
    select: { id: true, memorialId: true, status: true, blobKey: true },
  });

  if (!item || item.memorialId !== memorialId) {
    return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
  }

  if (item.status === CollectionItemStatus.APPROVED) {
    return NextResponse.json(
      { success: false, error: 'Cannot delete an approved item — reject it first' },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.collectionItem.delete({ where: { id: item.id } });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.COLLECTION_ITEM,
          entityId:   item.id,
          action:     AuditAction.DELETE,
          actorId:    userId,
          actorRole:  ActorRole.OWNER,
          reasonCode: ReasonCode.DELETION,
          metadata:   { memorialId: memorialId },
        },
      });
    });

    // Delete the stored file (best-effort — don't fail the request if
    // missing). Was unlink()ing from local public/uploads even in
    // production, where files live in R2 — so deleting an item would
    // have left its file orphaned in the bucket, still reachable by URL.
    // deleteFile() branches to R2 in production and disk in dev.
    if (item.blobKey) {
      try {
        await deleteFile(item.blobKey);
      } catch {
        console.warn('[Collection] Could not delete file:', item.blobKey);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[DELETE /api/memorial/[id]/collection/[itemId]]', error);
    return NextResponse.json({ success: false, error: 'Failed to delete item' }, { status: 500 });
  }
}
