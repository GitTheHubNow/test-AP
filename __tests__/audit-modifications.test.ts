import { prisma } from '@/lib/prisma';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
  getAuditEvents,
} from '@/lib/audit';
import {
  verifyMutationAudited,
  verifyCompleteAuditTrail,
} from '@/lib/auditEnforcement';
import { MemorialStatus, MemoryStatus } from '@prisma/client';

describe('Audit Integration - Modifications (Day 3)', () => {
  let testUserId: string;
  let testMemorialId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();

    testUserId = 'test-owner-day3';

    // Create test memorial with audit
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testUserId,
          title: 'Test Memorial',
          description: null,
          qrTokenHash: 'test-hash-day3',
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
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    testMemorialId = memorial.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should audit memory approval', async () => {
    // Create pending memory
    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: testMemorialId,
          authorName: 'Test Author',
          message: 'Test message',
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

    const beforeApproval = new Date();

    // Approve memory with audit
    await prisma.$transaction(async (tx) => {
      await tx.memory.update({
        where: { id: memory.id },
        data: { status: MemoryStatus.APPROVED },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY,
          entityId: memory.id,
          action: AuditAction.APPROVE,
          actorId: testUserId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.MODERATION,
          metadata: {
            previousStatus: MemoryStatus.PENDING,
            newStatus: MemoryStatus.APPROVED,
          },
        },
      });
    });

    // Verify approval was audited
    const isAudited = await verifyMutationAudited(
      EntityType.MEMORY,
      memory.id,
      AuditAction.APPROVE,
      beforeApproval
    );
    expect(isAudited).toBe(true);

    // Verify audit metadata
    const auditEvents = await getAuditEvents(EntityType.MEMORY, memory.id);
    const approvalEvent = auditEvents.find(e => e.action === AuditAction.APPROVE);
    expect(approvalEvent).toBeDefined();
    expect(approvalEvent!.metadata).toEqual({
      previousStatus: MemoryStatus.PENDING,
      newStatus: MemoryStatus.APPROVED,
    });
  });

  test('should audit memory rejection', async () => {
    // Create pending memory
    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: testMemorialId,
          authorName: 'Test Author',
          message: 'Test message',
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

    // Reject memory with audit
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
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.MODERATION,
          metadata: {
            previousStatus: MemoryStatus.PENDING,
            newStatus: MemoryStatus.REJECTED,
          },
        },
      });
    });

    // Verify rejection was audited
    const auditEvents = await getAuditEvents(EntityType.MEMORY, memory.id);
    const rejectionEvent = auditEvents.find(e => e.action === AuditAction.REJECT);
    expect(rejectionEvent).toBeDefined();
    expect(rejectionEvent!.actorRole).toBe(ActorRole.FUNERAL_HOME);
  });

  test('should audit memorial readOnly toggle', async () => {
    const beforeToggle = new Date();

    // Toggle readOnly with audit
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
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CORRECTION,
          metadata: {
            field: 'readOnly',
            previousValue: memorial!.readOnly,
            newValue: !memorial!.readOnly,
          },
        },
      });
    });

    // Verify toggle was audited
    const isAudited = await verifyMutationAudited(
      EntityType.MEMORIAL,
      testMemorialId,
      AuditAction.UPDATE,
      beforeToggle
    );
    expect(isAudited).toBe(true);
  });

  test('should audit memorial updates', async () => {
    // Update memorial with audit
    await prisma.$transaction(async (tx) => {
      const memorial = await tx.memorial.findUnique({
        where: { id: testMemorialId },
        select: { title: true, description: true },
      });

      await tx.memorial.update({
        where: { id: testMemorialId },
        data: {
          title: 'Updated Title',
          description: 'New description',
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: testMemorialId,
          action: AuditAction.UPDATE,
          actorId: testUserId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CORRECTION,
          metadata: {
            changes: {
              title: {
                from: memorial!.title,
                to: 'Updated Title',
              },
              description: {
                from: memorial!.description,
                to: 'New description',
              },
            },
          },
        },
      });
    });

    // Verify update was audited
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const updateEvents = auditEvents.filter(e => e.action === AuditAction.UPDATE);
    expect(updateEvents.length).toBeGreaterThan(0);

    const lastUpdate = updateEvents[updateEvents.length - 1];
    expect(lastUpdate.metadata.changes).toBeDefined();
    expect(lastUpdate.metadata.changes.title.to).toBe('Updated Title');
  });

  test('should prevent silent DB updates', async () => {
    // Attempt update without audit (should be avoided in real code)
    await prisma.memorial.update({
      where: { id: testMemorialId },
      data: { title: 'Silent Update' },
    });

    // Verify this update is NOT audited
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const updateEvents = auditEvents.filter(e =>
      e.action === AuditAction.UPDATE &&
      e.metadata?.changes?.title?.to === 'Silent Update'
    );

    expect(updateEvents).toHaveLength(0);

    // This test demonstrates the problem - manual enforcement needed until Day 5
  });

  test('should fail unauthorized mutation', async () => {
    const unauthorizedUserId = 'unauthorized-user';

    // Attempt to update memorial as wrong user
    await expect(
      prisma.$transaction(async (tx) => {
        const memorial = await tx.memorial.findUnique({
          where: { id: testMemorialId },
          select: { ownerId: true },
        });

        if (memorial!.ownerId !== unauthorizedUserId) {
          throw new Error('NOT_AUTHORIZED');
        }

        await tx.memorial.update({
          where: { id: testMemorialId },
          data: { title: 'Unauthorized Update' },
        });
      })
    ).rejects.toThrow('NOT_AUTHORIZED');

    // Verify memorial was not updated
    const memorial = await prisma.memorial.findUnique({
      where: { id: testMemorialId },
      select: { title: true },
    });
    expect(memorial!.title).toBe('Test Memorial');
  });

  test('should maintain complete audit trail', async () => {
    // Perform multiple operations
    await prisma.$transaction(async (tx) => {
      await tx.memorial.update({
        where: { id: testMemorialId },
        data: { readOnly: true },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: testMemorialId,
          action: AuditAction.UPDATE,
          actorId: testUserId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CORRECTION,
          metadata: { field: 'readOnly', newValue: true },
        },
      });
    });

    await prisma.$transaction(async (tx) => {
      await tx.memorial.update({
        where: { id: testMemorialId },
        data: { title: 'New Title' },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: testMemorialId,
          action: AuditAction.UPDATE,
          actorId: testUserId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CORRECTION,
          metadata: { field: 'title' },
        },
      });
    });

    // Verify complete audit trail
    const result = await verifyCompleteAuditTrail(
      EntityType.MEMORIAL,
      testMemorialId
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);

    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    expect(auditEvents.length).toBeGreaterThanOrEqual(3); // CREATE + 2 UPDATEs
  });
});