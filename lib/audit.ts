/**
 * Audit logging constants
 * Used across all API routes for consistent audit trail.
 *
 * ✅ Phase 1–10 (preserved)
 * ✅ Phase 11–13: Collection, Invite, Preview, Handover additions
 */

export const EntityType = {
  MEMORIAL:          'MEMORIAL',
  MEMORY:            'MEMORY',
  MEDIA:             'MEDIA',
  ENTITLEMENT:       'ENTITLEMENT',
  // Phase 11
  COLLECTION_ITEM:   'COLLECTION_ITEM',
  COLLECTION_INVITE: 'COLLECTION_INVITE',
  // Phase 12
  PREVIEW_SESSION:   'PREVIEW_SESSION',
  // Phase 13
  HANDOVER:          'HANDOVER',
  // Phase 20 — guest book moderation (was missing: staff-side page/API
  // existed nowhere, only the public submission endpoint did)
  GUEST_BOOK_ENTRY:  'GUEST_BOOK_ENTRY',
} as const;

export const AuditAction = {
  CREATE:   'CREATE',
  READ:     'READ',
  UPDATE:   'UPDATE',
  DELETE:   'DELETE',
  APPROVE:  'APPROVE',
  REJECT:   'REJECT',
  PUBLISH:  'PUBLISH',
  SEAL:     'SEAL',
  ARCHIVE:  'ARCHIVE',
  RESTORE:  'RESTORE',
  // Phase 10
  AUTO_EMAIL_SENT:       'AUTO_EMAIL_SENT',
  EXPIRY_WARNING_SENT:   'EXPIRY_WARNING_SENT',
  MEMORIAL_SUSPENDED:    'MEMORIAL_SUSPENDED',
  STALE_MEMORIES_FLAGGED: 'STALE_MEMORIES_FLAGGED',
  // Phase 12
  PROMOTE:  'PROMOTE',  // collection item → public memory
  // Phase 13
  HANDOVER_INITIATED:  'HANDOVER_INITIATED',
  HANDOVER_COMPLETED:  'HANDOVER_COMPLETED',
  HANDOVER_CANCELLED:  'HANDOVER_CANCELLED',
} as const;

export const ActorRole = {
  OWNER:  'OWNER',
  ADMIN:  'ADMIN',
  PUBLIC: 'PUBLIC',
  SYSTEM: 'SYSTEM',
  FAMILY: 'FAMILY',
  // Referenced by seal/route.ts and memory approve/reject routes as
  // ActorRole.FUNERAL_HOME before this fix — that value never existed,
  // so those routes were writing the literal string "FUNERAL_HOME" into
  // audit_events.actorRole (a plain String column, so no runtime error —
  // this only surfaces under `tsc`/`next build`, not `next dev`).
  FUNERAL_HOME: 'FUNERAL_HOME',
} as const;

export const ReasonCode = {
  CREATION:    'CREATION',
  EDIT:        'EDIT',
  DELETION:    'DELETION',
  APPROVAL:    'APPROVAL',
  REJECTION:   'REJECTION',
  REVOCATION:  'REVOCATION',
  AUTOMATION:  'AUTOMATION',
  HANDOVER:    'HANDOVER',
  PROMOTION:   'PROMOTION',  // Phase 12: collection item promoted to memory
  // Referenced by lib/jobs/index.ts (integrity check + auto-seal jobs)
  // before this fix — same underlying issue as ActorRole.FUNERAL_HOME
  // and ReasonCode.MODERATION above.
  VERIFICATION: 'VERIFICATION',
  // Referenced by memory approve/reject routes before this fix — see
  // ActorRole.FUNERAL_HOME comment above for the same underlying issue.
  MODERATION:  'MODERATION',
  // Referenced by lib/immutability.ts before this fix — same underlying
  // issue as ActorRole.FUNERAL_HOME above. Used when a correction is made
  // to previously-recorded (but not yet sealed) content.
  CORRECTION:  'CORRECTION',
} as const;

import { prisma } from '@/lib/prisma';

/**
 * Fetch the full audit trail for a single entity, oldest first.
 *
 * Added because lib/auditEnforcement.ts and lib/systemHealth.ts both
 * imported this from here and called it, but it was never actually
 * defined — an incomplete extraction at some point in this file's
 * history. Both call sites expect chronological (ascending timestamp)
 * order and read .id/.timestamp/.action/.actorId/.actorRole/.reasonCode
 * off each returned event, so this matches that shape against the
 * AuditEvent model.
 */
export async function getAuditEvents(entityType: EntityType, entityId: string) {
  return prisma.auditEvent.findMany({
    where:   { entityType, entityId },
    orderBy: { timestamp: 'asc' },
  });
}

export type EntityType  = typeof EntityType[keyof typeof EntityType];
export type AuditAction = typeof AuditAction[keyof typeof AuditAction];
export type ActorRole   = typeof ActorRole[keyof typeof ActorRole];
export type ReasonCode  = typeof ReasonCode[keyof typeof ReasonCode];
