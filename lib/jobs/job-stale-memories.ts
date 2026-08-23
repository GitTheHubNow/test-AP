import { prisma } from '@/lib/prisma';
import { MemoryStatus, MemorialStatus } from '@prisma/client';
import { sendEmailAsync, getDashboardUrl } from '@/lib/email';
import { renderStalePendingEmail } from '@/lib/email-templates/automation-emails';
import { clerkClient } from '@clerk/nextjs/server';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';

/**
 * job-stale-memories.ts
 *
 * Finds PENDING memories older than 30 days.
 * Sets stale = true on each.
 * Groups by memorial and sends one digest email per owner
 * who has newly-stale memories (only sends once per batch —
 * tracks by checking if any were just flipped to stale).
 *
 * Does NOT auto-reject. Owner decides what to do.
 *
 * Phase 10
 */
export async function runStaleMemoriesJob(): Promise<{
  processed: number;
  flagged: number;
  emailsSent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let flagged     = 0;
  let emailsSent  = 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find pending memories older than 30 days that aren't already flagged
  const staleMemories = await prisma.memory.findMany({
    where: {
      status:    MemoryStatus.PENDING,
      stale:     false,
      createdAt: { lte: thirtyDaysAgo },
      memorial: {
        status: MemorialStatus.ACTIVE,
      },
    },
    select: {
      id:         true,
      memorialId: true,
      memorial: {
        select: {
          id:      true,
          title:   true,
          ownerId: true,
        },
      },
    },
  });

  const processed = staleMemories.length;
  if (processed === 0) return { processed, flagged, emailsSent, errors };

  // Flag them all at once
  const staleIds = staleMemories.map(m => m.id);
  await prisma.memory.updateMany({
    where: { id: { in: staleIds } },
    data:  { stale: true },
  });
  flagged = staleIds.length;

  // Audit
  await prisma.auditEvent.create({
    data: {
      entityType: EntityType.MEMORY,
      entityId:   'BATCH',
      action:     AuditAction.STALE_MEMORIES_FLAGGED,
      actorId:    'SYSTEM',
      actorRole:  ActorRole.SYSTEM,
      reasonCode: ReasonCode.AUTOMATION,
      metadata:   { count: flagged, memoryIds: staleIds },
    },
  });

  // Group by memorial → send one email per memorial owner
  const byMemorial = new Map<string, { title: string; ownerId: string; count: number }>();
  for (const m of staleMemories) {
    const existing = byMemorial.get(m.memorialId);
    if (existing) {
      existing.count++;
    } else {
      byMemorial.set(m.memorialId, {
        title:   m.memorial.title,
        ownerId: m.memorial.ownerId,
        count:   1,
      });
    }
  }

  for (const [memorialId, { title, ownerId, count }] of byMemorial) {
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(ownerId);
      const ownerEmail = user.emailAddresses?.[0]?.emailAddress;

      if (!ownerEmail) continue;

      const moderationUrl = `${getDashboardUrl()}/memorial/${memorialId}/moderation`;

      const html = renderStalePendingEmail({
        memorialTitle: title,
        staleCount:    count,
        moderationUrl,
      });

      await sendEmailAsync({
        to:      ownerEmail,
        subject: `${count} pending ${count === 1 ? 'memory needs' : 'memories need'} review — ${title}`,
        html,
      });

      emailsSent++;
      console.log(`[staleMemories] Notified owner ${ownerId} for memorial ${memorialId} (${count} stale)`);

    } catch (err) {
      const msg = `Memorial ${memorialId}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`[staleMemories] Error — ${msg}`);
    }
  }

  return { processed, flagged, emailsSent, errors };
}
