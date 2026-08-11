import { prisma } from '@/lib/prisma';
import { EntityType } from '@/lib/audit';

/**
 * Compliance Reporter
 * Generates compliance reports for memorials and audit data.
 * 
 * NOTE: This is a stub implementation. Full compliance features to be implemented.
 */

export interface ComplianceReport {
  generatedAt: Date;
  periodStart: Date | null;
  periodEnd:   Date | null;
  memorialCount: number;
  auditEventCount: number;
  retentionCompliance: boolean;
  sealedMemorialsCount: number;
}

export async function generateComplianceReport(
  startDate?: Date,
  endDate?: Date,
): Promise<ComplianceReport> {
  // Previously took no parameters at all — the caller
  // (app/api/system/compliance/route.ts) always passed startDate/endDate,
  // parsed and validated them, then silently discarded them since this
  // function ignored its arguments entirely. Every report returned
  // platform-wide totals regardless of the requested date range.
  const dateFilter = (startDate || endDate) ? {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate   ? { lte: endDate }   : {}),
  } : undefined;

  const [memorialCount, auditEventCount, sealedCount] = await Promise.all([
    prisma.memorial.count({
      where: dateFilter ? { createdAt: dateFilter } : undefined,
    }),
    prisma.auditEvent.count({
      where: dateFilter ? { timestamp: dateFilter } : undefined,
    }),
    prisma.memorial.count({
      where: { sealed: true, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    }),
  ]);

  return {
    generatedAt: new Date(),
    periodStart: startDate ?? null,
    periodEnd:   endDate   ?? null,
    memorialCount,
    auditEventCount,
    retentionCompliance: true,
    sealedMemorialsCount: sealedCount,
  };
}

export async function generateEntityAuditExport(
  entityType: EntityType,
  entityId: string
): Promise<any> {
  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      entityType,
      entityId,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  return {
    entityType,
    entityId,
    exportedAt: new Date(),
    eventCount: auditEvents.length,
    events: auditEvents,
  };
}
