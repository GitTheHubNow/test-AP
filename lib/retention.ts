import { prisma } from '@/lib/prisma';
import { AuditAction } from '@/lib/audit';

export interface RetentionPolicy {
  action: string;
  retentionDays: number;
  description: string;
}

export const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    action: AuditAction.CREATE,
    retentionDays: -1, // Forever
    description: 'Creation events must be retained permanently',
  },
  {
    action: AuditAction.UPDATE,
    retentionDays: -1, // Forever
    description: 'Modification events must be retained permanently',
  },
  {
    action: AuditAction.APPROVE,
    retentionDays: -1, // Forever
    description: 'Moderation decisions must be retained permanently',
  },
  {
    action: AuditAction.REJECT,
    retentionDays: -1, // Forever
    description: 'Moderation decisions must be retained permanently',
  },
  {
    action: AuditAction.SEAL,
    retentionDays: -1, // Forever
    description: 'Seal events must be retained permanently',
  },
  {
    action: AuditAction.READ,
    retentionDays: 90, // 90 days
    description: 'Read access logs retained for compliance period',
  },
];

/**
 * Apply retention policies to audit events.
 * Deletes events that exceed their retention period.
 */
export async function applyRetentionPolicies(): Promise<{
  deleted: number;
  policies: Array<{ action: string; deletedCount: number }>;
}> {
  const results: Array<{ action: string; deletedCount: number }> = [];
  let totalDeleted = 0;

  for (const policy of RETENTION_POLICIES) {
    if (policy.retentionDays === -1) {
      // Permanent retention
      continue;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    const result = await prisma.auditEvent.deleteMany({
      where: {
        action: policy.action,
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    results.push({
      action: policy.action,
      deletedCount: result.count,
    });

    totalDeleted += result.count;
  }

  return {
    deleted: totalDeleted,
    policies: results,
  };
}

/**
 * Get retention policy for an action.
 */
export function getRetentionPolicy(action: string): RetentionPolicy | null {
  return RETENTION_POLICIES.find(p => p.action === action) || null;
}

/**
 * Validate that critical events are never deleted.
 */
export async function validateRetention(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check for memorials without creation audits
  const memorialsWithoutAudit = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM memorials m
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_events ae
      WHERE ae.entity_id = m.id
        AND ae.entity_type = 'MEMORIAL'
        AND ae.action = 'CREATE'
    )
  `;

  const missingCount = Number(memorialsWithoutAudit[0].count);
  if (missingCount > 0) {
    issues.push(`${missingCount} memorials missing creation audit`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}