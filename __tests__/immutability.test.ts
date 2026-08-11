import { prisma } from '@/lib/prisma';
import {
  generateContentHash,
  verifyContentHash,
  generateMemorialHash,
  generateMemoryHash,
  sealMemorial,
  sealMemory,
  verifyMemorialIntegrity,
  createMemorialCorrection,
  runIntegrityCheck,
} from '@/lib/immutability';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
  getAuditEvents,
} from '@/lib/audit';
import { MemorialStatus, MemoryStatus } from '@prisma/client';

describe('Immutability Enforcement (Day 5)', () => {
  let testMemorialId: string;
  let testOwnerId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();

    testOwnerId = 'immutable-owner';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should generate consistent content hash', () => {
    const content = { title: 'Test', description: 'Description' };
    const hash1 = generateContentHash(content);
    const hash2 = generateContentHash(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  test('should detect content changes', () => {
    const original = { title: 'Original', description: 'Text' };
    const modified = { title: 'Modified', description: 'Text' };

    const hash1 = generateContentHash(original);
    const hash2 = generateContentHash(modified);

    expect(hash1).not.toBe(hash2);
  });

  test('should verify content hash correctly', () => {
    const content = 'Test content';
    const hash = generateContentHash(content);

    expect(verifyContentHash(content, hash)).toBe(true);
    expect(verifyContentHash('Different content', hash)).toBe(false);
  });

  test('should create memorial with content hash', async () => {
    const title = 'Immutable Memorial';
    const description = 'Test description';
    const contentHash = generateMemorialHash({ title, description });

    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title,
          description,
          qrTokenHash: 'immutable-hash',
          contentHash,
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
          metadata: { contentHash },
        },
      });

      return m;
    });

    expect(memorial.contentHash).toBe(contentHash);

    // Verify hash is correct
    const verified = verifyContentHash(
      { title: memorial.title, description: memorial.description },
      memorial.contentHash!
    );
    expect(verified).toBe(true);
  });

  test('should seal memorial successfully', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Seal Test',
          description: 'Will be sealed',
          qrTokenHash: 'seal-hash',
          contentHash: generateMemorialHash({ title: 'Seal Test', description: 'Will be sealed' }),
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    await sealMemorial(memorial.id, testOwnerId, ActorRole.FUNERAL_HOME);

    const sealed = await prisma.memorial.findUnique({
      where: { id: memorial.id },
      select: { sealed: true, sealedAt: true },
    });

    expect(sealed!.sealed).toBe(true);
    expect(sealed!.sealedAt).toBeInstanceOf(Date);

    // Verify seal audit event
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, memorial.id);
    const sealEvent = auditEvents.find(e => e.action === AuditAction.SEAL);
    expect(sealEvent).toBeDefined();
  });

  test('should prevent double sealing', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Double Seal Test',
          description: null,
          qrTokenHash: 'double-seal-hash',
          contentHash: generateMemorialHash({ title: 'Double Seal Test', description: null }),
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    await sealMemorial(memorial.id, testOwnerId, ActorRole.FUNERAL_HOME);

    await expect(
      sealMemorial(memorial.id, testOwnerId, ActorRole.FUNERAL_HOME)
    ).rejects.toThrow('already sealed');
  });

  test('should prevent deletion of memorial', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Delete Prevention Test',
          description: null,
          qrTokenHash: 'delete-prevent-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Attempt delete should fail
    await expect(
      prisma.memorial.delete({ where: { id: memorial.id } })
    ).rejects.toThrow();

    // Verify still exists
    const exists = await prisma.memorial.findUnique({
      where: { id: memorial.id },
    });
    expect(exists).not.toBeNull();
  });

  test('should prevent deletion of memory', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Memory Delete Test',
          description: null,
          qrTokenHash: 'memory-delete-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: memorial.id,
          authorName: 'Test',
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

    await expect(
      prisma.memory.delete({ where: { id: memory.id } })
    ).rejects.toThrow();
  });

  test('should verify memorial integrity', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Integrity Test',
          description: 'Original content',
          qrTokenHash: 'integrity-hash',
          contentHash: generateMemorialHash({ title: 'Integrity Test', description: 'Original content' }),
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    const integrityCheck = await verifyMemorialIntegrity(memorial.id);

    expect(integrityCheck.valid).toBe(true);
    expect(integrityCheck.issues).toHaveLength(0);
  });

  test('should detect corrupted content', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Corruption Test',
          description: null,
          qrTokenHash: 'corruption-hash',
          contentHash: generateMemorialHash({ title: 'Corruption Test', description: null }),
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    // Manually corrupt content (simulate tampering)
    await prisma.$executeRaw`
      UPDATE memorials 
      SET content_hash = 'corrupted_hash_value'
      WHERE id = ${memorial.id}
    `;

    const integrityCheck = await verifyMemorialIntegrity(memorial.id);

    expect(integrityCheck.valid).toBe(false);
    expect(integrityCheck.issues.length).toBeGreaterThan(0);
    expect(integrityCheck.issues[0]).toContain('hash mismatch');
  });

  test('should create correction record for sealed entity', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Correction Test',
          description: 'Original',
          qrTokenHash: 'correction-hash',
          contentHash: generateMemorialHash({ title: 'Correction Test', description: 'Original' }),
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    await sealMemorial(memorial.id, testOwnerId, ActorRole.FUNERAL_HOME);

    const correctionId = await createMemorialCorrection(
      memorial.id,
      {
        title: 'Corrected Title',
        description: 'Corrected Description',
      },
      testOwnerId,
      ActorRole.FUNERAL_HOME
    );

    expect(correctionId).toBeDefined();

    // Verify correction audit event
    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, memorial.id);
    const correctionEvent = auditEvents.find(
      e => e.action === AuditAction.UPDATE && e.reasonCode === ReasonCode.CORRECTION
    );

    expect(correctionEvent).toBeDefined();
    expect(correctionEvent!.metadata.originalTitle).toBe('Correction Test');
    expect(correctionEvent!.metadata.correctedTitle).toBe('Corrected Title');
  });

  test('should run system-wide integrity check', async () => {
    // Create multiple sealed entities
    for (let i = 0; i < 3; i++) {
      const memorial = await prisma.$transaction(async (tx) => {
        const m = await tx.memorial.create({
          data: {
            ownerId: testOwnerId,
            title: `Check Test ${i}`,
            description: null,
            qrTokenHash: `check-hash-${i}`,
            contentHash: generateMemorialHash({ title: `Check Test ${i}`, description: null }),
            status: MemorialStatus.ACTIVE,
            readOnly: false,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: EntityType.MEMORIAL,
            entityId: m.id,
            action: AuditAction.CREATE,
            actorId: testOwnerId,
            actorRole: ActorRole.FUNERAL_HOME,
            reasonCode: ReasonCode.CREATION,
          },
        });

        return m;
      });

      await sealMemorial(memorial.id, testOwnerId, ActorRole.FUNERAL_HOME);
    }

    const integrityReport = await runIntegrityCheck();

    expect(integrityReport.totalChecked).toBe(3);
    expect(integrityReport.corruptedCount).toBe(0);
    expect(integrityReport.corrupted).toHaveLength(0);
  });

  test('should seal memory after approval', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Memory Seal Test',
          description: null,
          qrTokenHash: 'memory-seal-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: memorial.id,
          authorName: 'Test Author',
          message: 'Test message for sealing',
          contentHash: generateMemoryHash({ authorName: 'Test Author', message: 'Test message for sealing' }),
          status: MemoryStatus.APPROVED,
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

    await sealMemory(memory.id, testOwnerId, ActorRole.FUNERAL_HOME);

    const sealed = await prisma.memory.findUnique({
      where: { id: memory.id },
      select: { sealed: true, sealedAt: true },
    });

    expect(sealed!.sealed).toBe(true);
    expect(sealed!.sealedAt).toBeInstanceOf(Date);
  });

  test('should reject sealing unapproved memory', async () => {
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'Unapproved Seal Test',
          description: null,
          qrTokenHash: 'unapproved-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: testOwnerId,
          actorRole: ActorRole.FUNERAL_HOME,
          reasonCode: ReasonCode.CREATION,
        },
      });

      return m;
    });

    const memory = await prisma.$transaction(async (tx) => {
      const mem = await tx.memory.create({
        data: {
          memorialId: memorial.id,
          authorName: 'Test',
          message: 'Pending message',
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

    await expect(
      sealMemory(memory.id, testOwnerId, ActorRole.FUNERAL_HOME)
    ).rejects.toThrow('Only approved memories can be sealed');
  });
});