import { prisma } from '@/lib/prisma';
import {
  createAuditEvent,
  getAuditEvents,
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';

describe('Audit Event System - Day 1', () => {
  beforeEach(async () => {
    // Clean up audit events before each test
    await prisma.auditEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should create audit event with all required fields', async () => {
    const auditData = {
      entityType: EntityType.MEMORIAL,
      entityId: 'memorial-123',
      action: AuditAction.CREATE,
      actorId: 'user-456',
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.CREATION,
    };

    await createAuditEvent(auditData);

    const events = await getAuditEvents(EntityType.MEMORIAL, 'memorial-123');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: 'MEMORIAL',
      entityId: 'memorial-123',
      action: 'CREATE',
      actorId: 'user-456',
      actorRole: 'FUNERAL_HOME',
      reasonCode: 'CREATION',
    });
    expect(events[0].timestamp).toBeInstanceOf(Date);
  });

  test('should create audit event with optional metadata', async () => {
    const auditData = {
      entityType: EntityType.MEMORY,
      entityId: 'memory-789',
      action: AuditAction.UPDATE,
      actorId: 'user-123',
      actorRole: ActorRole.SYSTEM,
      reasonCode: ReasonCode.CORRECTION,
      metadata: {
        previousStatus: 'PENDING',
        newStatus: 'APPROVED',
        field: 'status',
      },
    };

    await createAuditEvent(auditData);

    const events = await getAuditEvents(EntityType.MEMORY, 'memory-789');

    expect(events).toHaveLength(1);
    expect(events[0].metadata).toEqual({
      previousStatus: 'PENDING',
      newStatus: 'APPROVED',
      field: 'status',
    });
  });

  test('should retrieve audit events in chronological order', async () => {
    const entityId = 'memorial-999';

    await createAuditEvent({
      entityType: EntityType.MEMORIAL,
      entityId,
      action: AuditAction.CREATE,
      actorId: 'user-1',
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.CREATION,
    });

    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await createAuditEvent({
      entityType: EntityType.MEMORIAL,
      entityId,
      action: AuditAction.UPDATE,
      actorId: 'user-1',
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.CORRECTION,
    });

    const events = await getAuditEvents(EntityType.MEMORIAL, entityId);

    expect(events).toHaveLength(2);
    expect(events[0].action).toBe('CREATE');
    expect(events[1].action).toBe('UPDATE');
    expect(events[0].timestamp.getTime()).toBeLessThan(
      events[1].timestamp.getTime()
    );
  });

  test('should support multiple entity types', async () => {
    await createAuditEvent({
      entityType: EntityType.MEMORIAL,
      entityId: 'memorial-1',
      action: AuditAction.CREATE,
      actorId: 'user-1',
      actorRole: ActorRole.FUNERAL_HOME,
      reasonCode: ReasonCode.CREATION,
    });

    await createAuditEvent({
      entityType: EntityType.MEMORY,
      entityId: 'memory-1',
      action: AuditAction.CREATE,
      actorId: 'user-1',
      actorRole: ActorRole.PUBLIC,
      reasonCode: ReasonCode.CREATION,
    });

    const memorialEvents = await getAuditEvents(
      EntityType.MEMORIAL,
      'memorial-1'
    );
    const memoryEvents = await getAuditEvents(EntityType.MEMORY, 'memory-1');

    expect(memorialEvents).toHaveLength(1);
    expect(memoryEvents).toHaveLength(1);
    expect(memorialEvents[0].entityType).toBe('MEMORIAL');
    expect(memoryEvents[0].entityType).toBe('MEMORY');
  });

  test('should handle different actor roles', async () => {
    const roles = [
      ActorRole.FUNERAL_HOME,
      ActorRole.FAMILY,
      ActorRole.SYSTEM,
      ActorRole.CEMETERY,
      ActorRole.PUBLIC,
    ];

    for (const role of roles) {
      await createAuditEvent({
        entityType: EntityType.MEMORIAL,
        entityId: `memorial-${role}`,
        action: AuditAction.READ,
        actorId: `actor-${role}`,
        actorRole: role,
        reasonCode: ReasonCode.PUBLIC_ACCESS,
      });
    }

    const allEvents = await prisma.auditEvent.findMany();
    expect(allEvents).toHaveLength(5);

    const actorRoles = allEvents.map(e => e.actorRole);
    expect(actorRoles).toContain('FUNERAL_HOME');
    expect(actorRoles).toContain('FAMILY');
    expect(actorRoles).toContain('SYSTEM');
    expect(actorRoles).toContain('CEMETERY');
    expect(actorRoles).toContain('PUBLIC');
  });
});