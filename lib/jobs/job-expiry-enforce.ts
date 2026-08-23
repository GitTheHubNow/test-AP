import { prisma } from '@/lib/prisma';
import { MemorialStatus } from '@prisma/client';
import { sendEmailAsync, getDashboardUrl } from '@/lib/email';
import { renderMemorialSuspendedEmail } from '@/lib/email-templates/automation-emails';
import { clerkClient } from '@clerk/nextjs/server';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';

/**
 * job-expiry-enforce.ts
 *
 * Finds ACTIVE memorials where expiresAt < now.
 * Suspends them (public page goes dark).
 * Sends owner a suspension notification email.
 *
 * Phase 10
 */
export async function runExpiryEnforceJob(): Promise<{
  processed: number;
  suspended: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let suspended = 0;

  const now = new Date();

  const expired = await prisma.memorial.findMany({
    where: {
      status:    MemorialStatus.ACTIVE,
      expiresAt: { not: null, lte: now },
    },
    select: {
      id:        true,
      title:     true,
      ownerId:   true,
      expiresAt: true,
    },
  });

  const processed = expired.length;

  for (const memorial of expired) {
    try {
      // Suspend the memorial
      await prisma.memorial.update({
        where: { id: memorial.id },
        data:  { status: MemorialStatus.SUSPENDED },
      });

      // Notify owner
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(memorial.ownerId);
        const ownerEmail = user.emailAddresses?.[0]?.emailAddress;

        if (ownerEmail) {
          const renewUrl = `${getDashboardUrl()}/memorial/${memorial.id}/settings`;
          const html = renderMemorialSuspendedEmail({
            memorialTitle: memorial.title,
            renewUrl,
            expiresAt:     memorial.expiresAt!,
          });

          await sendEmailAsync({
            to:      ownerEmail,
            subject: `Your memorial for ${memorial.title} has been suspended`,
            html,
          });
        }
      } catch (emailErr) {
        // Email failure must not prevent suspension
        console.error(`[expiryEnforce] Email error for ${memorial.id}:`, emailErr);
      }

      await prisma.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId:   memorial.id,
          action:     AuditAction.MEMORIAL_SUSPENDED,
          actorId:    'SYSTEM',
          actorRole:  ActorRole.SYSTEM,
          reasonCode: ReasonCode.AUTOMATION,
          metadata:   { expiresAt: memorial.expiresAt },
        },
      });

      suspended++;
      console.log(`[expiryEnforce] Suspended memorial ${memorial.id}`);

    } catch (err) {
      const msg = `Memorial ${memorial.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`[expiryEnforce] Error — ${msg}`);
    }
  }

  return { processed, suspended, errors };
}
