import { prisma } from '@/lib/prisma';
import { EntityType, getAuditEvents, verifyCreationAudit } from '@/lib/audit';

describe('API Audit Integration (Day 2)', () => {
  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.memory.deleteMany();
    await prisma.memorial.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('memorial creation API should create audit event atomically', async () => {
    // This test simulates the API behavior
    const userId = 'api-user-123';
    let memorialId: string;
    let creationSucceeded = false;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const memorial = await tx.memorial.create({
          data: {
            ownerId: userId,
            title: 'API Test Memorial',
            description: null,
            qrTokenHash: 'api-hash-123',
            status: 'ACTIVE',
            readOnly: false,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: EntityType.MEMORIAL,
            entityId: memorial.id,
            action: 'CREATE',
            actorId: userId,
            actorRole: 'FUNERAL_HOME',
            reasonCode: 'CREATION',
            metadata: {
              title: memorial.title,
              hasDescription: false,
            },
          },
        });

        return memorial;
      });

      memorialId = result.id;
      creationSucceeded = true;
    } catch (error) {
      creationSucceeded = false;
    }

    expect(creationSucceeded).toBe(true);
    expect(memorialId!).toBeDefined();

    // Verify both memorial and audit exist
    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId! },
    });
    expect(memorial).not.toBeNull();

    const hasAudit = await verifyCreationAudit(EntityType.MEMORIAL, memorialId!);
    expect(hasAudit).toBe(true);
  });

  test('if audit fails, memorial creation should rollback', async () => {
    const userId = 'rollback-test-user';
    let errorOccurred = false;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.memorial.create({
          data: {
            ownerId: userId,
            title: 'Should Rollback',
            description: null,
            qrTokenHash: 'rollback-hash',
            status: 'ACTIVE',
            readOnly: false,
          },
        });

        // Simulate audit failure
        throw new Error('Audit system error');
      });
    } catch (error) {
      errorOccurred = true;
    }

    expect(errorOccurred).toBe(true);

    // Verify nothing was created
    const memorials = await prisma.memorial.findMany({
      where: { ownerId: userId },
    });
    expect(memorials).toHaveLength(0);

    const audits = await prisma.auditEvent.findMany();
    expect(audits).toHaveLength(0);
  });
});