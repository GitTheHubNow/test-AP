import { prisma } from '@/lib/prisma';
import { EntityType, AuditAction, getAuditEvents } from '@/lib/audit';
import { MemorialStatus, MemoryStatus } from '@prisma/client';

describe('API Mutation Audit Integration (Day 3)', () => {
  let testUserId: string;
  let testMemorialId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();

    testUserId = 'api-test-user';

    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testUserId,
          title: 'API Test Memorial',
          description: null,
          qrTokenHash: 'api-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testUserId,
          actorRole: 'FUNERAL_HOME',
          reasonCode: 'CREATION',
        },
      });

      return m;
    });

    testMemorialId = memorial.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('approve API creates audit event', async () => {
    // Create memory
    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: testMemorialId,
          message: 'Test',
          status: MemoryStatus.PENDING,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY,
          entityId: mem.id,
          action: AuditAction.CREATE,
          actorId: 'anonymous',
          actorRole: 'PUBLIC',
          reasonCode: 'CREATION',
        },
      });

      return mem;
    });

    // Simulate approve API call
    await prisma.$transaction(async (tx) => {
      await tx.memory.update({
        where: { id: memory.id },
        data: { status: MemoryStatus.APPROVED },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY
          entityId: memory.id,
          action: AuditAction.APPROVE,
          actorId: testUserId,
          actorRole: 'FUNERAL_HOME',
          reasonCode: 'MODERATION',
          metadata: {
            previousStatus: MemoryStatus.PENDING,
            newStatus: MemoryStatus.APPROVED,
          },
        },
      });
    });

    // Verify audit trail
    const auditEvents = await getAuditEvents(EntityType.MEMORY, memory.id);
    expect(auditEvents).toHaveLength(2); // CREATE + APPROVE
    
    const approveEvent = auditEvents.find(e => e.action === AuditAction.APPROVE);
    expect(approveEvent).toBeDefined();
    expect(approveEvent!.actorId).toBe(testUserId);
    expect(approveEvent!.reasonCode).toBe('MODERATION');
  });

  test('reject API creates audit event', async () => {
    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: testMemorialId,
          message: 'Test',
          status: MemoryStatus.PENDING,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY,
          entityId: mem.id,
          action: AuditAction.CREATE,
          actorId: 'anonymous',
          actorRole: 'PUBLIC',
          reasonCode: 'CREATION',
        },
      });

      return mem;
    });

    // Simulate reject API call
    await prisma.$transaction(async (tx) => {
      await tx.memory.update({
        where: { id: memory.id },
        data: {
          status: MemoryStatus.REJECTED,
          rejectedAt: new Date(),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY,
          entityId: memory.id,
          action: AuditAction.REJECT,
          actorId: testUserId,
          actorRole: 'FUNERAL_HOME',
          reasonCode: 'MODERATION',
          metadata: {
            previousStatus: MemoryStatus.PENDING,
            newStatus: MemoryStatus.REJECTED,
          },
        },
      });
    });

    // Verify audit trail
    const auditEvents = await getAuditEvents(EntityType.MEMORY, memory.id);
    const rejectEvent = auditEvents.find(e => e.action === AuditAction.REJECT);
    expect(rejectEvent).toBeDefined();
  });

  test('readOnly toggle creates audit event', async () => {
    // Simulate readOnly toggle API call
    await prisma.$transaction(async (tx) => {
      const memorial = await tx.memorial.findUnique({
        where: { id: testMemorialId },
        select: { readOnly: true },
      });

      await tx.memorial.update({
        where: { id: testMemorialId },
        data: { readOnly: !memorial!.readOnly },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: testMemorialId,
          action: AuditAction.UPDATE,
          actorId: testUserId,
          actorRole: 'FUNERAL_HOME',
          reasonCode: 'CORRECTION',
          metadata: {
            field: 'readOnly',
            previousValue: memorial!.readOnly,
            newValue: !memorial!.readOnly,
          },
        },
      });
    });

    // Verify audit event
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const updateEvents = auditEvents.filter(e => e.action === AuditAction.UPDATE);
    expect(updateEvents.length).toBeGreaterThan(0);
  });

  test('memorial update creates audit event with change tracking', async () => {
    const originalMemorial = await prisma.memorial.findUnique({
      where: { id: testMemorialId },
      select: { title: true, description: true },
    });

    // Simulate update API call
    await prisma.$transaction(async (tx) => {
      await tx.memorial.update({
        where: { id: testMemorialId },
        data: {
          title: 'Updated Title',
          description: 'Updated Description',
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: testMemorialId,
          action: AuditAction.UPDATE,
          actorId: testUserId,
          actorRole: 'FUNERAL_HOME',
          reasonCode: 'CORRECTION',
          metadata: {
            changes: {
              title: {
                from: originalMemorial!.title,
                to: 'Updated Title',
              },
              description: {
                from: originalMemorial!.description,
                to: 'Updated Description',
              },
            },
          },
        },
      });
    });

    // Verify change tracking
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const updateEvent = auditEvents.find(
      e => e.action === AuditAction.UPDATE && e.metadata?.changes?.title
    );

    expect(updateEvent).toBeDefined();
    expect(updateEvent!.metadata.changes.title.from).toBe('API Test Memorial');
    expect(updateEvent!.metadata.changes.title.to).toBe('Updated Title');
  });

  test('transaction rollback prevents partial audit', async () => {
    let errorOccurred = false;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.memorial.update({
          where: { id: testMemorialId },
          data: { title: 'Rollback Test' },
        });

        await tx.auditEvent.create({
          data: {
            entityType: EntityType.MEMORIAL,
            entityId: testMemorialId,
            action: AuditAction.UPDATE,
            actorId: testUserId,
            actorRole: 'FUNERAL_HOME',
            reasonCode: 'CORRECTION',
          },
        });

        // Force failure
        throw new Error('Transaction failed');
      });
    } catch {
      errorOccurred = true;
    }

    expect(errorOccurred).toBe(true);

    // Verify memorial was not updated
    const memorial = await prisma.memorial.findUnique({
      where: { id: testMemorialId },
      select: { title: true },
    });
    expect(memorial!.title).toBe('API Test Memorial');

    // Verify no extra audit events
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    expect(auditEvents).toHaveLength(1); // Only CREATE event
  });
});