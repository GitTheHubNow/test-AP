import { prisma } from '@/lib/prisma';
import {
  EntityType,
  AuditAction,
  getAuditEvents,
} from '@/lib/audit';

/**
 * Verify that a mutation has a corresponding audit event.
 * Used for compliance checks and testing.
 */
export async function verifyMutationAudited(
  entityType: EntityType,
  entityId: string,
  expectedAction: AuditAction,
  afterTimestamp?: Date
): Promise<boolean> {
  const auditEvents = await getAuditEvents(entityType, entityId);

  const relevantEvents = afterTimestamp
    ? auditEvents.filter(e => e.timestamp >= afterTimestamp)
    : auditEvents;

  return relevantEvents.some(e => e.action === expectedAction);
}

/**
 * Get the audit trail for an entity.
 * Returns chronological list of all changes.
 */
export async function getEntityAuditTrail(
  entityType: EntityType,
  entityId: string
): Promise<any[]> {
  return getAuditEvents(entityType, entityId);
}

/**
 * Verify entity has complete audit trail.
 * Checks for creation event and proper sequencing.
 */
export async function verifyCompleteAuditTrail(
  entityType: EntityType,
  entityId: string
): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const auditEvents = await getAuditEvents(entityType, entityId);
  const issues: string[] = [];

  // Check for creation event
  const hasCreation = auditEvents.some(e => e.action === AuditAction.CREATE);
  if (!hasCreation) {
    issues.push('Missing creation audit event');
  }

  // Verify chronological order
  for (let i = 1; i < auditEvents.length; i++) {
    if (auditEvents[i].timestamp < auditEvents[i - 1].timestamp) {
      issues.push('Audit events out of chronological order');
      break;
    }
  }

  // Check for required fields
  for (const event of auditEvents) {
    if (!event.actorId) issues.push(`Event ${event.id} missing actorId`);
    if (!event.actorRole) issues.push(`Event ${event.id} missing actorRole`);
    if (!event.reasonCode) issues.push(`Event ${event.id} missing reasonCode`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}