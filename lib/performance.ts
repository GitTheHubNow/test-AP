import { prisma } from '@/lib/prisma';

/**
 * Performance Monitor
 * Tracks system performance metrics for the platform-admin dashboard.
 *
 * NOTE: connection-pool-style metrics (pool size, active/idle connections)
 * are not included. On Neon serverless Postgres accessed from Vercel
 * serverless functions, there is no persistent pool to report on per
 * request — those numbers would be fabricated. audit-trail and entity
 * counts below are real, queried values.
 */

export interface PerformanceMetrics {
  timestamp: Date;
  databaseResponseTime: number;
  activeMemorials: number;
  pendingModerations: number;
  todaySubmissions: number;
  auditTrail: {
    totalEvents: number;
    eventsLast24h: number;
    eventsPerMinute: number;
  };
  entities: {
    totalMemorials: number;
    totalMemories: number;
    sealedPercentage: number;
  };
}

export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const startTime = Date.now();

  const [activeMemorials, pendingModerations] = await Promise.all([
    prisma.memorial.count({ where: { status: 'ACTIVE' } }),
    prisma.memory.count({ where: { status: 'PENDING' } }),
  ]);

  const databaseResponseTime = Date.now() - startTime;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    todaySubmissions,
    totalAuditEvents,
    eventsLast24h,
    totalMemorials,
    totalMemories,
    sealedMemorials,
  ] = await Promise.all([
    prisma.memory.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.auditEvent.count(),
    prisma.auditEvent.count({ where: { timestamp: { gte: yesterday } } }),
    prisma.memorial.count(),
    prisma.memory.count(),
    prisma.memorial.count({ where: { sealed: true } }),
  ]);

  return {
    timestamp: new Date(),
    databaseResponseTime,
    activeMemorials,
    pendingModerations,
    todaySubmissions,
    auditTrail: {
      totalEvents: totalAuditEvents,
      eventsLast24h,
      // rate over the last 24h window, not a live instantaneous rate
      eventsPerMinute: eventsLast24h / (24 * 60),
    },
    entities: {
      totalMemorials,
      totalMemories,
      sealedPercentage: totalMemorials > 0 ? (sealedMemorials / totalMemorials) * 100 : 0,
    },
  };
}
