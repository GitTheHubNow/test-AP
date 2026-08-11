import { prisma } from '@/lib/prisma';
import { runSystemHealthCheck } from '@/lib/systemHealth';
import { generateComplianceReport } from '@/lib/compliance';
import {
  generateMemorialHash,
  sealMemorial,
  verifyMemorialIntegrity,
} from '@/lib/immutability';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
  getAuditEvents,
} from '@/lib/audit';
import { MemorialStatus } from '@prisma/client';

describe('System Integration (Day 6)', () => {
  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('system health check should pass with clean system', async () => {
    const health = await runSystemHealthCheck();

    expect(health.status).toBe('HEALTHY');
    expect(health.checks.database.status).toBe('PASS');
    expect(health.checks.auditTrail.status).toBe('PASS');
    expect(health.checks.immutability.status).toBe('PASS');
    expect(health.checks.deleteProtection.status).toBe('PASS');
  });

  test('system should detect missing creation audit', async () => {
    
    // Create memorial without audit (violation)
    await prisma.memorial.create({
      data: {
        ownerId: 'test-owner',
        title: 'Unaudited Memorial',
        description: null,
        qrTokenHash: 'unaudited-hash',
        status: MemorialStatus.ACTIVE,
        readOnly: false,
      },
    });

    const health = await runSystemHealthCheck();

    expect(health.status).toBe('CRITICAL');
    expect(health.checks.auditTrail.status).toBe('FAIL');
    expect(health.checks.auditTrail.message).toContain('without creation audit');
  });

  test('compliance report should capture all activities', async () => {
    const startDate = new Date();

    // Create memorial with full audit trail
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'compliance-owner',
          title: 'Compliance Test',
          description: null,
          qrTokenHash: 'compliance-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
          contentHash: generateMemorialHash({ title: 'Compliance Test', description: null }),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'compliance-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Seal memorial
    await sealMemorial(memorial.id, 'compliance-owner', ActorRole.FUNERAL_HOME);

    const endDate = new Date();

    // Generate compliance report
    const report = await generateComplianceReport(startDate, endDate);

    expect(report.summary.totalEntities).toBeGreaterThan(0);
    expect(report.summary.sealedEntities).toBe(1);
    expect(report.auditTrail.creations).toBe(1);
    expect(report.auditTrail.seals).toBe(1);
    expect(report.integrityStatus.corrupted).toBe(0);
  });

  test('delete protection should prevent memorial deletion', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'delete-test-owner',
          title: 'Delete Test',
          description: null,
          qrTokenHash: 'delete-test-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'delete-test-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Attempt to delete should fail
    await expect(
      prisma.memorial.delete({
        where: { id: memorial.id },
      })
    ).rejects.toThrow();

    // Verify memorial still exists
    const exists = await prisma.memorial.findUnique({
      where: { id: memorial.id },
    });
    expect(exists).not.toBeNull();
  });

  test('sealed memorial should reject content modifications', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'seal-test-owner',
          title: 'Seal Test',
          description: 'Original',
          qrTokenHash: 'seal-test-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
          contentHash: generateMemorialHash({ title: 'Seal Test', description: 'Original' }),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'seal-test-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Seal memorial
    await sealMemorial(memorial.id, 'seal-test-owner', ActorRole.FUNERAL_HOME);

    // Attempt to modify sealed content should fail
    await expect(
      prisma.memorial.update({
        where: { id: memorial.id },
        data: { title: 'Modified' },
      })
    ).rejects.toThrow(/Sealed memorials cannot be modified/);

    // Verify content unchanged
    const unchanged = await prisma.memorial.findUnique({
      where: { id: memorial.id },
      select: { title: true },
    });
    expect(unchanged?.title).toBe('Seal Test');
  });

  test('integrity check should detect corrupted content', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'integrity-owner',
          title: 'Integrity Test',
          description: null,
          qrTokenHash: 'integrity-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
          contentHash: generateMemorialHash({ title: 'Integrity Test', description: null }),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'integrity-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Seal memorial
    await sealMemorial(memorial.id, 'integrity-owner', ActorRole.FUNERAL_HOME);

    // Manually corrupt content hash (simulating tampering)
    await prisma.$executeRaw`
      UPDATE memorials 
      SET content_hash = 'corrupted_hash'
      WHERE id = ${memorial.id}
    `;

    // Verify integrity should detect corruption
    const integrityCheck = await verifyMemorialIntegrity(memorial.id);

    expect(integrityCheck.valid).toBe(false);
    expect(integrityCheck.issues.length).toBeGreaterThan(0);
    expect(integrityCheck.issues[0]).toContain('hash mismatch');
  });

  test('automatic audit trigger should create events on update', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'auto-audit-owner',
          title: 'Auto Audit Test',
          description: null,
          qrTokenHash: 'auto-audit-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'auto-audit-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Set session variables for trigger
    await prisma.$executeRaw`SET app.current_user_id = 'auto-audit-owner'`;
    await prisma.$executeRaw`SET app.current_user_role = 'FUNERAL_HOME'`;

    // Update memorial - trigger should create audit event
    await prisma.memorial.update({
      where: { id: memorial.id },
      data: { readOnly: true },
    });

    // Verify automatic audit event was created
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, memorial.id);
    const updateEvents = auditEvents.filter(e => e.action === AuditAction.UPDATE);

    expect(updateEvents.length).toBeGreaterThan(0);
  });

  test('full lifecycle audit trail should be complete', async () => {
    // Create memorial
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'lifecycle-owner',
          title: 'Lifecycle Test',
          description: null,
          qrTokenHash: 'lifecycle-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
          contentHash: generateMemorialHash({ title: 'Lifecycle Test', description: null }),
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'lifecycle-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Create memory
    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: memorial.id,
          authorName: 'Test Author',
          message: 'Test message',
          status: 'PENDING',
          contentHash: 'test-hash',
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

    // Approve memory
    await prisma.$transaction(async (tx) => {
      await tx.memory.update({
        where: { id: memory.id },
        data: { status: 'APPROVED' },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORY,
          entityId: memory.id,
          action: AuditAction.APPROVE,
          actorId: 'lifecycle-owner',
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.MODERATION,
        },
      });
    });

    // Seal memorial
    await sealMemorial(memorial.id, 'lifecycle-owner', ActorRole.FUNERAL_HOME);

    // Verify complete audit trail
    const memorialAudits = await getAuditEvents(EntityType.MEMORIAL, memorial.id);
    const memoryAudits = await getAuditEvents(EntityType.MEMORY, memory.id);

    expect(memorialAudits.length).toBe(2); // CREATE + SEAL
    expect(memoryAudits.length).toBe(2); // CREATE + APPROVE

    const actions = memorialAudits.map(e => e.action);
    expect(actions).toContain(AuditAction.CREATE);
    expect(actions).toContain(AuditAction.SEAL);
  });
});