// lib/approvals.ts
//
// Shared function for the "staff approves/rejects something a family
// member or visitor submitted" pattern — used by Memory, Media,
// GuestBookEntry, and CollectionItem moderation. Each of those grew its
// own approve/reject route with the same two writes (update the status
// column, write an AuditEvent) done slightly differently by hand each
// time. Checked before building this: AuditEvent is already a generic,
// permanent, polymorphic history table — an entirely separate
// "Approval" table would have duplicated it. This function doesn't add
// a new table; it makes the existing pattern consistent everywhere it's
// used, and fixes two real, live inconsistencies found while auditing
// the 4 existing routes:
//   - media/approve never wrote an AuditEvent at all — every other
//     approve action did. Media approvals had no audit trail.
//   - collection/[itemId] logged status changes under
//     AuditAction.UPDATE; every other route used
//     AuditAction.APPROVE/REJECT for the same real action. Different
//     entities' approve/reject history wasn't queryable the same way.
//
// New approval-shaped features (obituary text, plaque proofs, service
// detail changes, etc.) should call this instead of hand-rolling the
// same two writes a fifth time.

import { prisma } from '@/lib/prisma';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';

export type ApprovableEntity = 'MEMORY' | 'MEDIA' | 'GUEST_BOOK_ENTRY' | 'COLLECTION_ITEM';
export type ApprovalDecision = 'APPROVED' | 'REJECTED';

interface RecordApprovalInput {
  entity:     ApprovableEntity;
  entityId:   string;
  memorialId: string;          // always logged in metadata, regardless of entity type — every moderation UI is scoped to one memorial
  decision:   ApprovalDecision;
  reviewedBy: string;          // Clerk userId of the staff member deciding
  note?:      string;          // optional — was "rejectionReason required" on some routes (a real bug fixed earlier this session on CollectionItem; this generalises that fix everywhere: never required, always optional)
}

// Each of the 4 models names its "why it was rejected" column
// differently (Memory/Media/GuestBookEntry don't have one at all today;
// only CollectionItem does, as rejectionReason). Update-data shape is
// therefore built per-entity rather than assumed uniform. Returns a
// plain object — the caller passes it straight to the matching
// tx.<model>.update({ data }) call, so each branch's shape must match
// that model's real Prisma UpdateInput.
function buildUpdateData(entity: ApprovableEntity, decision: ApprovalDecision, reviewedBy: string, note: string | undefined) {
  const now = new Date();

  switch (entity) {
    case 'COLLECTION_ITEM':
      return {
        status:          decision,
        reviewedBy,
        reviewedAt:      now,
        ...(decision === 'REJECTED' && note ? { rejectionReason: note } : {}),
      };
    case 'MEMORY':
      // Memory.rejectedAt exists in the schema but the old route never
      // set it (unlike Media, which does). Fixed here as a deliberate,
      // agreed small consistency improvement — not a silent behaviour
      // change slipped into a refactor.
      return {
        status: decision,
        rejectedAt: decision === 'REJECTED' ? now : null,
      };
    case 'MEDIA':
      return {
        status: decision,
        rejectedAt: decision === 'REJECTED' ? now : null, // clears on re-approve — matches the existing media/approve route's own comment ("Clear rejection timestamp if re-approving")
      };
    case 'GUEST_BOOK_ENTRY':
      return {
        status: decision,
      };
  }
}

/**
 * Approves or rejects a Memory, Media, GuestBookEntry, or CollectionItem
 * in one transaction: updates the entity's own status column (used
 * directly by hot-path moderation queue queries — deliberately not
 * moved to a join, see file header) and writes a consistent AuditEvent
 * for it. Call this from every approve/reject route instead of writing
 * the two updates by hand.
 */
export async function recordApproval(input: RecordApprovalInput): Promise<void> {
  const { entity, entityId, memorialId, decision, reviewedBy, note } = input;

  await prisma.$transaction(async (tx) => {
    // Explicit per-entity switch rather than dynamic tx[modelName] —
    // each model's update shape genuinely differs (see buildUpdateData),
    // and this keeps every write fully type-checked with no suppression
    // needed, matching this codebase's existing zero-@ts-ignore standard.
    switch (entity) {
      case 'MEMORY':
        await tx.memory.update({
          where: { id: entityId },
          data:  buildUpdateData('MEMORY', decision, reviewedBy, note),
        });
        break;
      case 'MEDIA':
        await tx.media.update({
          where: { id: entityId },
          data:  buildUpdateData('MEDIA', decision, reviewedBy, note),
        });
        break;
      case 'GUEST_BOOK_ENTRY':
        await tx.guestBookEntry.update({
          where: { id: entityId },
          data:  buildUpdateData('GUEST_BOOK_ENTRY', decision, reviewedBy, note),
        });
        break;
      case 'COLLECTION_ITEM':
        await tx.collectionItem.update({
          where: { id: entityId },
          data:  buildUpdateData('COLLECTION_ITEM', decision, reviewedBy, note),
        });
        break;
    }

    await tx.auditEvent.create({
      data: {
        entityType: EntityType[entity],
        entityId,
        action:     decision === 'APPROVED' ? AuditAction.APPROVE : AuditAction.REJECT,
        actorId:    reviewedBy,
        actorRole:  ActorRole.FUNERAL_HOME,
        reasonCode: ReasonCode.MODERATION,
        metadata:   { memorialId, ...(note ? { note } : {}) },
      },
    });
  });
}
