import { prisma } from '@/lib/prisma';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';

export interface MemorialReadAudit {
  memorialId: string;
  token: string;
  actorId?: string;
  actorRole: ActorRole;
  reasonCode: ReasonCode;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Audit a memorial read access.
 * Creates append-only read log for compliance.
 * Non-blocking - failures are logged but don't prevent read.
 */
export async function auditMemorialRead(
  data: MemorialReadAudit
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL,
        entityId: data.memorialId,
        action: AuditAction.READ,
        actorId: data.actorId || 'anonymous',
        actorRole: data.actorRole,
        reasonCode: data.reasonCode,
        metadata: {
          token: data.token.substring(0, 8), // First 8 chars only
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      },
    });
  } catch (error) {
    // Log error but don't throw - read audit failure shouldn't block access
    console.error('Failed to audit read:', error);
  }
}

/**
 * Check if a memorial requires read auditing.
 * Public memorials: optional
 * Restricted memorials: always audit
 */
export async function requiresReadAudit(memorialId: string): Promise<boolean> {
  const memorial = await prisma.memorial.findUnique({
    where: { id: memorialId },
    select: {
      status: true,
      // Future: Add 'visibility' field for family-only, authority-only, etc.
    },
  });

  if (!memorial) {
    return false;
  }

  // For MVP: all active memorials are public, audit optional
  // Future: Check visibility flags for restricted access
  return false; // Optional auditing for now
}

/**
 * Get read access log for a memorial.
 * Used for compliance reporting and security monitoring.
 */
export async function getMemorialReadLog(
  memorialId: string,
  limit: number = 100
): Promise<any[]> {
  return prisma.auditEvent.findMany({
    where: {
      entityType: EntityType.MEMORIAL,
      entityId: memorialId,
      action: AuditAction.READ,
    },
    orderBy: {
      timestamp: 'desc',
    },
    take: limit,
    select: {
      id: true,
      actorId: true,
      actorRole: true,
      reasonCode: true,
      timestamp: true,
      metadata: true,
    },
  });
}

/**
 * Get read statistics for a memorial.
 */
export async function getMemorialReadStats(
  memorialId: string
): Promise<{
  totalReads: number;
  publicReads: number;
  familyReads: number;
  firstAccess: Date | null;
  lastAccess: Date | null;
}> {
  const readEvents = await prisma.auditEvent.findMany({
    where: {
      entityType: EntityType.MEMORIAL,
      entityId: memorialId,
      action: AuditAction.READ,
    },
    select: {
      actorRole: true,
      timestamp: true,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  const publicReads = readEvents.filter(e => e.actorRole === ActorRole.PUBLIC).length;
  const familyReads = readEvents.filter(e => e.actorRole === ActorRole.FAMILY).length;

  return {
    totalReads: readEvents.length,
    publicReads,
    familyReads,
    firstAccess: readEvents.length > 0 ? readEvents[0].timestamp : null,
    lastAccess: readEvents.length > 0 ? readEvents[readEvents.length - 1].timestamp : null,
  };
}