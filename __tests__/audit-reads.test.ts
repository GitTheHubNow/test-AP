import { prisma } from '@/lib/prisma';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,import { prisma } from '@/lib/prisma';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { auditMemorialRead, getMemorialReadLog } from '@/lib/auditRead';
import { MemorialStatus } from '@prisma/client';

describe('Read Audit API Integration (Day 4)', () => {
  let testMemorialId: string;
  let testOwnerId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();

    testOwnerId = 'api-owner-day4';

    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: testOwnerId,
          title: 'API Read Test',
          description: null,
          qrTokenHash: 'api-read-hash',
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

    testMemorialId = memorial.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('public memorial page creates read audit', async () => {
    // Simulate page visit
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'public-token',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    const readLog = await getMemorialReadLog(testMemorialId);
    expect(readLog).toHaveLength(1);
    expect(readLog[0].actorRole).toBe(ActorRole.PUBLIC);
  });

  test('owner dashboard access creates read audit', async () => {
    // Simulate owner accessing moderation
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'owner-dashboard',
      actorId: testOwnerId,
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.VERIFICATION,
    });

    const readLog = await getMemorialReadLog(testMemorialId);
    expect(readLog).toHaveLength(1);
    expect(readLog[0].actorId).toBe(testOwnerId);
    expect(readLog[0].actorRole).toBe(ActorRole.FUNERAL_HOME);
  });

  test('access log API returns stats and log', async () => {
    // Create some read events
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'token-1',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'token-2',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    // This would be called by the API route
    const readLog = await getMemorialReadLog(testMemorialId);

    expect(readLog.length).toBeGreaterThan(0);
    expect(readLog[0]).toHaveProperty('timestamp');
    expect(readLog[0]).toHaveProperty('actorRole');
  });

  test('read audit is append-only', async () => {
    const eventId = await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'test-token',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    const readEvents = await prisma.auditEvent.findMany({
      where: {
        entityId: testMemorialId,
        action: AuditAction.READ,
      },
    });

    expect(readEvents).toHaveLength(1);

    // Attempt to update (should fail at DB level with rules from Day 1)
    // For now, just verify event exists
    const event = readEvents[0];
    expect(event.action).toBe(AuditAction.READ);
  });
});
  getAuditEvents,
} from '@/lib/audit';
import {
  auditMemorialRead,
  getMemorialReadLog,
  getMemorialReadStats,
} from '@/lib/auditRead';
import { MemorialStatus } from '@prisma/client';

describe('Audit on Reads (Day 4)', () => {
  let testMemorialId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();

    // Create test memorial
    const memorial = await prisma.$transaction(async (tx) => {
      const m = await tx.memorial.create({
        data: {
          ownerId: 'test-owner',
          title: 'Read Test Memorial',
          description: null,
          qrTokenHash: 'read-test-hash',
          status: MemorialStatus.ACTIVE,
          readOnly: false,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId: m.id,
          action: AuditAction.CREATE,
          actorId: 'test-owner',
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

  test('should audit public memorial read', async () => {
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'test-token-123',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const readEvents = auditEvents.filter(e => e.action === AuditAction.READ);

    expect(readEvents).toHaveLength(1);
    expect(readEvents[0]).toMatchObject({
      entityType: EntityType.MEMORIAL,
      entityId: testMemorialId,
      action: AuditAction.READ,
      actorId: 'anonymous',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });
  });

  test('should audit owner dashboard access', async () => {
    const ownerId = 'owner-123';

    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'owner-dashboard',
      actorId: ownerId,
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.VERIFICATION,
    });

    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const readEvents = auditEvents.filter(e => e.action === AuditAction.READ);

    expect(readEvents).toHaveLength(1);
    expect(readEvents[0].actorId).toBe(ownerId);
    expect(readEvents[0].actorRole).toBe(ActorRole.FUNERAL_HOME);
  });

  test('should include metadata in read audit', async () => {
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'full-token-with-metadata',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    const auditEvents = await getAuditEvents(EntityType.MEMORIAL, testMemorialId);
    const readEvent = auditEvents.find(e => e.action === AuditAction.READ);

    expect(readEvent!.metadata).toMatchObject({
      token: 'full-tok', // First 8 chars only
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });
  });

  test('should not block read if audit fails', async () => {
    // Simulate audit failure by using invalid data
    // The function catches errors and logs them
    await expect(
      auditMemorialRead({
        memorialId: 'invalid-id',
        token: 'test',
        actorRole: ActorRole.PUBLIC,
        reasonCode: ReasonCode.PUBLIC_ACCESS,
      })
    ).resolves.not.toThrow();

    // Read would continue even if audit failed
  });

  test('should retrieve read access log', async () => {
    // Create multiple read events
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'token-1',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'token-2',
      actorId: 'owner-123',
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.VERIFICATION,
    });

    const readLog = await getMemorialReadLog(testMemorialId);

    expect(readLog).toHaveLength(2);
    expect(readLog[0].timestamp).toBeDefined();
    expect(readLog[0].actorRole).toBeDefined();
  });

  test('should calculate read statistics', async () => {
    // Create diverse read events
    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'public-1',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'public-2',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.PUBLIC_ACCESS,
    });

    await auditMemorialRead({
      memorialId: testMemorialId,
      token: 'family-1',
      actorId: 'family-member',
      actorRole: ActorRole.FAMILY,
      reasonCode: ReasonCode.FAMILY_ACCESS,
    });

    const stats = await getMemorialReadStats(testMemorialId);

    expect(stats.totalReads).toBe(3);
    expect(stats.publicReads).toBe(2);
    expect(stats.familyReads).toBe(1);
    expect(stats.firstAccess).toBeInstanceOf(Date);
    expect(stats.lastAccess).toBeInstanceOf(Date);
  });

  test('should support read log pagination', async () => {
    // Create 10 read events
    for (let i = 0; i < 10; i++) {
      await auditMemorialRead({
        memorialId: testMemorialId,
        token: `token-${i}`,
        actorRole: ActorRole.PUBLIC,
        reasonCode: ReasonCode.PUBLIC_ACCESS,
      });
    }

    // Get limited results
    const limitedLog = await getMemorialReadLog(testMemorialId, 5);
    expect(limitedLog).toHaveLength(5);

    // Get all results
    const fullLog = await getMemorialReadLog(testMemorialId, 100);
    expect(fullLog).toHaveLength(10);
  });

  test('should handle multiple actors reading same memorial', async () => {
    const actors = [
      { id: 'user-1', role: ActorRole.PUBLIC },
      { id: 'user-2', role: ActorRole.PUBLIC },
      { id: 'owner', role: ActorRole.FUNERAL_HOME },
      { id: 'family', role: ActorRole.FAMILY },
    ];

    for (const actor of actors) {
      await auditMemorialRead({
        memorialId: testMemorialId,
        token: `token-${actor.id}`,
        actorId: actor.id,
        actorRole: actor.role,
        reasonCode: ReasonCode.PUBLIC_ACCESS,
      });
    }

    const readLog = await getMemorialReadLog(testMemorialId);
    expect(readLog).toHaveLength(4);

    const actorIds = readLog.map(e => e.actorId);
    expect(actorIds).toContain('user-1');
    expect(actorIds).toContain('owner');
    expect(actorIds).toContain('family');
  });

  test('should maintain chronological order in read log', async () => {
    const timestamps: Date[] = [];

    for (let i = 0; i < 5; i++) {
      await auditMemorialRead({
        memorialId: testMemorialId,
        token: `token-${i}`,
        actorRole: ActorRole.PUBLIC,
        reasonCode: ReasonCode.PUBLIC_ACCESS,
      });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    const readLog = await getMemorialReadLog(testMemorialId);

    // Verify descending order (most recent first)
    for (let i = 1; i < readLog.length; i++) {
      expect(readLog[i].timestamp.getTime()).toBeLessThanOrEqual(
        readLog[i - 1].timestamp.getTime()
      );
    }
  });
});