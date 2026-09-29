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
  // Referenced by __tests__/audit.test.ts's "should handle different actor
  // roles" test before this fix — same underlying issue as FUNERAL_HOME
  // above. A cemetery operator acting on a memorial/case independently of
  // the funeral home that created it.
  CEMETERY: 'CEMETERY',
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
  // Family self-service actions (hide/show memorial, hide a comment,
  // edit basic details) via the family-access session — see
  // lib/familyAccess.ts. Distinct from HANDOVER above, which marks the
  // one-time ownership transfer event itself, not ongoing use of it.
  FAMILY_SELF_SERVICE: 'FAMILY_SELF_SERVICE',
  // Referenced by lib/immutability.ts before this fix — same underlying
  // issue as ActorRole.FUNERAL_HOME above. Used when a correction is made
  // to previously-recorded (but not yet sealed) content.
  CORRECTION:  'CORRECTION',
  // Referenced by lib/auditRead.ts callers (auditMemorialRead) and by
  // __tests__/audit-reads.test.ts, audit.test.ts, day7-integration.test.ts
  // before this fix — same underlying issue as CORRECTION above. Cover a
  // memorial-page READ event by an anonymous visitor vs. a signed-in family
  // member respectively; distinct from FAMILY_SELF_SERVICE, which is a
  // family WRITE action, not a read.
  PUBLIC_ACCESS: 'PUBLIC_ACCESS',
  FAMILY_ACCESS: 'FAMILY_ACCESS',
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

/**
 * Create a single audit event.
 *
 * Added because __tests__/audit.test.ts and audit-creation.test.ts both
 * imported this from here and called it, but — same underlying issue as
 * getAuditEvents above — it was never actually defined. This is just the
 * write-side counterpart: every API route already inlines this exact
 * `prisma.auditEvent.create({ data: {...} })` shape directly, so this
 * gives tests (and any future route that wants it) a shared helper for it.
 */
export async function createAuditEvent(data: {
  entityType: EntityType;
  entityId:   string;
  action:     AuditAction;
  actorId:    string;
  actorRole:  ActorRole;
  reasonCode: ReasonCode;
  metadata?:  object;
}) {
  return prisma.auditEvent.create({ data });
}

/**
 * Check whether an entity has a CREATE audit event on record.
 *
 * Added because __tests__/audit-creation.test.ts and
 * api-audit-integration.test.ts both imported this from here and called
 * it, but it was never actually defined — same underlying issue as
 * getAuditEvents above.
 */
export async function verifyCreationAudit(entityType: EntityType, entityId: string): Promise<boolean> {
  const count = await prisma.auditEvent.count({
    where: { entityType, entityId, action: AuditAction.CREATE },
  });
  return count > 0;
}

export type EntityType  = typeof EntityType[keyof typeof EntityType];
export type AuditAction = typeof AuditAction[keyof typeof AuditAction];
export type ActorRole   = typeof ActorRole[keyof typeof ActorRole];
export type ReasonCode  = typeof ReasonCode[keyof typeof ReasonCode];
