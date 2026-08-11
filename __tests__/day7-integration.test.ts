import { prisma } from '@/lib/prisma';
import { JobExecutor, JobType } from '@/lib/jobs';
import { collectPerformanceMetrics } from '@/lib/performance';
import { applyRetentionPolicies } from '@/lib/retention';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';
import { MemorialStatus, MemoryStatus } from '@prisma/client';
import { generateMemorialHash } from '@/lib/immutability';

describe('Day 7 - Advanced Features (Integration)', () => {
  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('integrity check job should detect corruption', async () => {
    // Create sealed memorial
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'job-test-owner',
          title: 'Job Test',
          description: null,
          qrTokenHash: 'job-hash',
          contentHash: generateMemorialHash({ title: 'Job Test', description: null }),
          status: MemorialStatus.ACTIVE,
          readOnly: false,
          sealed: true,
          sealedAt: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'job-test-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Corrupt content hash
    await prisma.$executeRaw`
      UPDATE memorials 
      SET content_hash = 'corrupted'
      WHERE id = ${memorial.id}
    `;

    // Run integrity check job
    const executor = new JobExecutor();
    const result = await executor.executeJob(JobType.INTEGRITY_CHECK);

    expect(result.success).toBe(false);
    expect(result.data.corruptedCount).toBe(1);
  });

  test('audit cleanup job should remove old read events', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'cleanup-owner',
          title: 'Cleanup Test',
          description: null,
          qrTokenHash: 'cleanup-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'cleanup-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Create old read event (91 days ago)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 91);

    await prisma.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL,
        entityId: memorial.id,
        action: AuditAction.READ,
        actorId: 'anonymous',
        actorRole: ActorRole.PUBLIC,
        reasonCode: ReasonCode.PUBLIC_ACCESS,
        timestamp: oldDate,
      },
    });

    const beforeCount = await prisma.auditEvent.count({
      where: { action: AuditAction.READ },
    });

    // Run cleanup job
    const executor = new JobExecutor();
    const result = await executor.executeJob(JobType.AUDIT_CLEANUP);

    expect(result.success).toBe(true);

    const afterCount = await prisma.auditEvent.count({
      where: { action: AuditAction.READ },
    });

    expect(afterCount).toBeLessThan(beforeCount);
  });

  test('batch operations should process multiple memories', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'batch-owner',
          title: 'Batch Test',
          description: null,
          qrTokenHash: 'batch-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'batch-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Create 5 pending memories
    const memoryIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const memory = await prisma.$transaction(async (tx) => {
        const mem = await tx.memory.create({
          data: {
            memorialId: memorial.id,
            authorName: `Author ${i}`,
            message: `Message ${i}`,
            status: MemoryStatus.PENDING,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: EntityType.MEMORY,
            entityId: mem.id,
            action: AuditAction.CREATE,
            actorId: 'anonymous',
            actorRole: ActorRole.PUBLIC,
            reasonCode: ReasonCode.CREATION,
          },
        });

        return mem;
      });

      memoryIds.push(memory.id);
    }

    // Batch approve all memories (simulating API call)
    await prisma.$transaction(async (tx) => {
      for (const memoryId of memoryIds) {
        await tx.memory.update({
          where: { id: memoryId },
          data: { status: MemoryStatus.APPROVED },
        });

        await tx.auditEvent.create({
          data: {
            entityType: EntityType.MEMORY,
            entityId: memoryId,
            action: AuditAction.APPROVE,
            actorId: 'batch-owner',
            actorRole: ActorRole.FUNERAL_HOME,
            reasonCode: ReasonCode.MODERATION,
            metadata: { batchOperation: true },
          },
        });
      }
    });

    // Verify all approved
    const approvedCount = await prisma.memory.count({
      where: {
        memorialId: memorial.id,
        status: MemoryStatus.APPROVED,
      },
    });

    expect(approvedCount).toBe(5);
  });

  test('performance metrics should be collected', async () => {
    const metrics = await collectPerformanceMetrics();

    expect(metrics.database).toBeDefined();
    expect(metrics.auditTrail).toBeDefined();
    expect(metrics.entities).toBeDefined();
    expect(metrics.auditTrail.totalEvents).toBeGreaterThanOrEqual(0);
  });

  test('retention policies should preserve critical events', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'retention-owner',
          title: 'Retention Test',
          description: null,
          qrTokenHash: 'retention-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'retention-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    const beforeCount = await prisma.auditEvent.count({
      where: { action: AuditAction.CREATE },
    });

    // Apply retention policies
    await applyRetentionPolicies();

    const afterCount = await prisma.auditEvent.count({
      where: { action: AuditAction.CREATE },
    });

    // CREATE events should never be deleted
    expect(afterCount).toBe(beforeCount);
  });
});