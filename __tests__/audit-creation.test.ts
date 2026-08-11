import { prisma } from '@/lib/prisma';
import {
  createAuditEvent,
  getAuditEvents,
  verifyCreationAudit,
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';
import { MemorialStatus } from '@prisma/client';

describe('Audit Integration - Memorial Creation (Day 2)', () => {
  beforeEach(async () => {
    // Clean up before each test
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should create audit event when memorial is created', async () => {
    const userId = 'test-user-123';
    const title = 'Test Memorial';

    // Simulate memorial creation with audit
    const result = await prisma.$transaction(async (tx) => {
      const memorial = await tx.memorial.create({
        data: {
          ownerId: userId,
          title,
          description: null,
          qrTokenHash: 'test-hash-123',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: memorial.id,
          action: AuditAction.CREATE,
          actorId: userId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
          metadata: {
            title: memorial.title,
            hasDescription: false,
          },
        },
      });

      return memorial;
    });

    // Verify memorial was created
    expect(result.id).toBeDefined();
    expect(result.title).toBe(title);

    // Verify audit event exists
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, result.id);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      entityType: 'MEMORIAL',
      entityId: result.id,
      action: 'CREATE',
      actorId: userId,
      actorRole: 'FUNERAL_HOME',
      reasonCode: 'CREATION',
    });
    expect(auditEvents[0].metadata).toEqual({
      title: title,
      hasDescription: false,
    });
  });

  test('should rollback memorial creation if audit fails', async () => {
    const userId = 'test-user-456';

    // Attempt transaction that will fail on audit
    await expect(
      prisma.$transaction(async (tx) => {
        const memorial = await tx.memorial.create({
          data: {
            ownerId: userId,
            title: 'Will Fail',
            description: null,
            qrTokenHash: 'test-hash-456',
            status: MemorialStatus.ACTIVE,
            readOnly: false,
          },
        });

        // Intentionally fail audit creation
        throw new Error('Audit failed');
      })
    ).rejects.toThrow('Audit failed');

    // Verify memorial was NOT created
    const memorials = await prisma.memorial.findMany({
      where: { ownerId: userId },
    });
    expect(memorials).toHaveLength(0);

    // Verify no audit events exist
    const auditEvents = await prisma.auditEvent.findMany();
    expect(auditEvents).toHaveLength(0);
  });

  test('should verify creation audit exists', async () => {
    const userId = 'test-user-789';

    // Create memorial with audit
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: userId,
          title: 'Verified Memorial',
          description: null,
          qrTokenHash: 'test-hash-789',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: userId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Verify creation audit
    const hasCreationAudit = await verifyCreationAudit(
      EntityType.MEMORIAL,
      memorial.id
    );
    expect(hasCreationAudit).toBe(true);
  });

  test('should detect missing creation audit', async () => {
    // Create memorial WITHOUT audit (violation)
    const memorial = await prisma.memorial.create({
      data: {
        ownerId: 'test-user-999',
        title: 'Unaudited Memorial',
        description: null,
        qrTokenHash: 'test-hash-999',
        status: MemorialStatus.ACTIVE,
        readOnly: false,
      },
    });

    // Verify creation audit is missing
    const hasCreationAudit = await verifyCreationAudit(
      EntityType.MEMORIAL,
      memorial.id
    );
    expect(hasCreationAudit).toBe(false);
  });

  test('should audit public memory submission', async () => {
    // First create memorial
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'owner-123',
          title: 'Public Memorial',
          description: null,
          qrTokenHash: 'public-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'owner-123',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Create memory with audit
    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: memorial.id,
          authorName: 'Anonymous User',
          message: 'Test memory message',
          status: 'PENDING',
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
          metadata: {
            memorialId: memorial.id,
            hasAuthorName: true,
            messageLength: 19,
          },
        },
      });

      return mem;
    });

    // Verify memory audit
    const memoryAudits = await getAuditEvents(EntityType.MEMORY, memory.id);
    expect(memoryAudits).toHaveLength(1);
    expect(memoryAudits[0]).toMatchObject({
      entityType: 'MEMORY',
      action: 'CREATE',
      actorRole: 'PUBLIC',
      reasonCode: 'CREATION',
    });
  });

  test('should include all required audit fields', async () => {
    const userId = 'complete-test-user';

    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: userId,
          title: 'Complete Audit Test',
          description: 'With description',
          qrTokenHash: 'complete-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: userId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
          metadata: {
            title: m.title,
            hasDescription: true,
          },
        },
      });

      return m;
    });

    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, memorial.id);
    const audit = auditEvents[0];

    // Verify all required fields
    expect(audit.id).toBeDefined();
    expect(audit.entityType).toBe('MEMORIAL');
    expect(audit.entityId).toBe(memorial.id);
    expect(audit.action).toBe('CREATE');
    expect(audit.actorId).toBe(userId);
    expect(audit.actorRole).toBe('FUNERAL_HOME');
    expect(audit.reasonCode).toBe('CREATION');
    expect(audit.timestamp).toBeInstanceOf(Date);
    expect(audit.metadata).toBeDefined();
  });
});