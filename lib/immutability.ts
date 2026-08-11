import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';

/**
 * Generate SHA-256 hash of content.
 * Used for integrity verification and tamper detection.
 */
export function generateContentHash(content: string | object): string {
  const data = typeof content === 'string' 
    ? content 
    : JSON.stringify(content);
  
  return createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Verify content matches stored hash.
 * Returns true if content is unchanged.
 */
export function verifyContentHash(
  content: string | object,
  storedHash: string
): boolean {
  const currentHash = generateContentHash(content);
  return currentHash === storedHash;
}

/**
 * Generate hash for memorial content.
 * Includes title and description only.
 */
export function generateMemorialHash(memorial: {
  title: string;
  description: string | null;
}): string {
  return generateContentHash({
    title: memorial.title,
    description: memorial.description,
  });
}

/**
 * Generate hash for memory content.
 * Includes author name and message.
 */
export function generateMemoryHash(memory: {
  authorName: string | null;
  message: string;
}): string {
  return generateContentHash({
    authorName: memory.authorName,
    message: memory.message,
  });
}

/**
 * Seal a memorial, making it immutable.
 * Creates SEAL audit event.
 */
export async function sealMemorial(
  memorialId: string,
  actorId: string,
  actorRole: ActorRole
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Get current memorial state
    const memorial = await tx.memorial.findUnique({
      where: { id: memorialId },
      select: {
        id: true,
        title: true,
        description: true,
        contentHash: true,
        sealed: true,
      },
    });

    if (!memorial) {
      throw new Error('Memorial not found');
    }

    if (memorial.sealed) {
      throw new Error('Memorial already sealed');
    }

    // Generate or verify content hash
    const currentHash = generateMemorialHash(memorial);
    
    if (memorial.contentHash && memorial.contentHash !== currentHash) {
      throw new Error('Content hash mismatch - memorial may be corrupted');
    }

    // Seal the memorial
    await tx.memorial.update({
      where: { id: memorialId },
      data: {
        sealed: true,
        sealedAt: new Date(),
        contentHash: currentHash,
      },
    });

    // Create seal audit event
    await tx.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL,
        entityId: memorialId,
        action: AuditAction.SEAL,
        actorId,
        actorRole,
        reasonCode: ReasonCode.VERIFICATION,
        metadata: {
          contentHash: currentHash,
        },
      },
    });
  });
}

/**
 * Seal a memory, making it immutable.
 * Typically called after approval.
 */
export async function sealMemory(
  memoryId: string,
  actorId: string,
  actorRole: ActorRole
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const memory = await tx.memory.findUnique({
      where: { id: memoryId },
      select: {
        id: true,
        authorName: true,
        message: true,
        contentHash: true,
        sealed: true,
        status: true,
      },
    });

    if (!memory) {
      throw new Error('Memory not found');
    }

    if (memory.sealed) {
      throw new Error('Memory already sealed');
    }

    // Only seal approved memories
    if (memory.status !== 'APPROVED') {
      throw new Error('Only approved memories can be sealed');
    }

    const currentHash = generateMemoryHash(memory);
    
    if (memory.contentHash && memory.contentHash !== currentHash) {
      throw new Error('Content hash mismatch - memory may be corrupted');
    }

    await tx.memory.update({
      where: { id: memoryId },
      data: {
        sealed: true,
        sealedAt: new Date(),
        contentHash: currentHash,
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: EntityType.MEMORY,
        entityId: memoryId,
        action: AuditAction.SEAL,
        actorId,
        actorRole,
        reasonCode: ReasonCode.VERIFICATION,
        metadata: {
          contentHash: currentHash,
        },
      },
    });
  });
}

/**
 * Create correction record for sealed entity.
 * Append-only: original preserved, correction added.
 */
export async function createMemorialCorrection(
  memorialId: string,
  correction: {
    title?: string;
    description?: string;
  },
  actorId: string,
  actorRole: ActorRole
): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const memorial = await tx.memorial.findUnique({
      where: { id: memorialId },
      select: {
        id: true,
        title: true,
        description: true,
        sealed: true,
      },
    });

    if (!memorial) {
      throw new Error('Memorial not found');
    }

    if (!memorial.sealed) {
      throw new Error('Only sealed memorials require correction records');
    }

    // Create correction audit event (append-only)
    const correctionEvent = await tx.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL,
        entityId: memorialId,
        action: AuditAction.UPDATE,
        actorId,
        actorRole,
        reasonCode: ReasonCode.CORRECTION,
        metadata: {
          originalTitle: memorial.title,
          originalDescription: memorial.description,
          correctedTitle: correction.title,
          correctedDescription: correction.description,
          correctionType: 'APPEND_ONLY',
        },
      },
    });

    return correctionEvent.id;
  });
}

/**
 * Verify integrity of all content in a memorial.
 * Checks hashes for memorial and all memories.
 */
export async function verifyMemorialIntegrity(
  memorialId: string
): Promise<{
  valid: boolean;
  issues: string[];
  memorial: { expected: string; actual: string } | null;
  memories: Array<{ id: string; expected: string; actual: string }>;
}> {
  const issues: string[] = [];
  let memorialHashStatus = null;
  const memoryHashIssues: Array<{ id: string; expected: string; actual: string }> = [];

  // Verify memorial hash
  const memorial = await prisma.memorial.findUnique({
    where: { id: memorialId },
    select: {
      id: true,
      title: true,
      description: true,
      contentHash: true,
    },
  });

  if (!memorial) {
    issues.push('Memorial not found');
    return { valid: false, issues, memorial: null, memories: [] };
  }

  if (memorial.contentHash) {
    const currentHash = generateMemorialHash(memorial);
    if (currentHash !== memorial.contentHash) {
      issues.push('Memorial content hash mismatch');
      memorialHashStatus = {
        expected: memorial.contentHash,
        actual: currentHash,
      };
    }
  }

  // Verify memory hashes
  const memories = await prisma.memory.findMany({
    where: { memorialId },
    select: {
      id: true,
      authorName: true,
      message: true,
      contentHash: true,
    },
  });

  for (const memory of memories) {
    if (memory.contentHash) {
      const currentHash = generateMemoryHash(memory);
      if (currentHash !== memory.contentHash) {
        issues.push(`Memory ${memory.id} hash mismatch`);
        memoryHashIssues.push({
          id: memory.id,
          expected: memory.contentHash,
          actual: currentHash,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    memorial: memorialHashStatus,
    memories: memoryHashIssues,
  };
}

/**
 * Periodic integrity check for all sealed entities.
 * Should be run as a cron job.
 */
export async function runIntegrityCheck(): Promise<{
  totalChecked: number;
  corruptedCount: number;
  corrupted: Array<{ entityType: string; entityId: string; issue: string }>;
}> {
  const corrupted: Array<{ entityType: string; entityId: string; issue: string }> = [];
  
  // Check sealed memorials
  const sealedMemorials = await prisma.memorial.findMany({
    where: { sealed: true, contentHash: { not: null } },
    select: {
      id: true,
      title: true,
      description: true,
      contentHash: true,
    },
  });

  for (const memorial of sealedMemorials) {
    const currentHash = generateMemorialHash(memorial);
    if (currentHash !== memorial.contentHash) {
      corrupted.push({
        entityType: 'MEMORIAL',
        entityId: memorial.id,
        issue: 'Content hash mismatch',
      });
    }
  }

  // Check sealed memories
  const sealedMemories = await prisma.memory.findMany({
    where: { sealed: true, contentHash: { not: null } },
    select: {
      id: true,
      authorName: true,
      message: true,
      contentHash: true,
    },
  });

  for (const memory of sealedMemories) {
    const currentHash = generateMemoryHash(memory);
    if (currentHash !== memory.contentHash) {
      corrupted.push({
        entityType: 'MEMORY',
        entityId: memory.id,
        issue: 'Content hash mismatch',
      });
    }
  }

  return {
    totalChecked: sealedMemorials.length + sealedMemories.length,
    corruptedCount: corrupted.length,
    corrupted,
  };
}