import { prisma } from '@/lib/prisma';
import { MemorialStatus } from '@prisma/client';
import { sendEmailAsync, getDashboardUrl } from '@/lib/email';
import { renderExpiryWarningEmail } from '@/lib/email-templates/automation-emails';
import { clerkClient } from '@clerk/nextjs/server';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';

/**
 * job-expiry-warning.ts
 *
 * Finds ACTIVE memorials where:
 * - expiresAt is set
 * - expiryWarningSentAt is null (warning not yet sent)
 * - expiresAt is within the next 5 years (≤ 5 years from today)
 *   i.e. today >= expiresAt - 5 years
 *
 * Sends a warning email to the memorial owner.
 * Marks expiryWarningSentAt to prevent resend.
 *
 * Phase 10
 */
export async function runExpiryWarningJob(): Promise<{
  processed: number;
  sent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sent = 0;

  const now       = new Date();
  const fiveYears = new Date(now);
  fiveYears.setFullYear(fiveYears.getFullYear() + 5);

  // Memorials expiring within the next 5 years that haven't had a warning sent
  const candidates = await prisma.memorial.findMany({
    where: {
      status:               MemorialStatus.ACTIVE,
      expiryWarningSentAt:  null,
      expiresAt: {
        not: null,
        lte: fiveYears, // expires within 5 years
        gt:  now,       // but not yet expired
      },
    },
    select: {
      id:        true,
      title:     true,
      ownerId:   true,
      expiresAt: true,
    },
  });

  const processed = candidates.length;

  for (const memorial of candidates) {
    try {
      // Get owner email
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(memorial.ownerId);
      const ownerEmail = user.emailAddresses?.[0]?.emailAddress;

      if (!ownerEmail) {
        errors.push(`Memorial ${memorial.id}: no owner email found`);
        continue;
      }

      const expiresAt       = memorial.expiresAt!;
      const msRemaining     = expiresAt.getTime() - now.getTime();
      const yearsRemaining  = Math.floor(msRemaining / (1000 * 60 * 60 * 24 * 365));
      const renewUrl        = `${getDashboardUrl()}/memorial/${memorial.id}/settings`;

      const html = renderExpiryWarningEmail({
        memorialTitle:  memorial.title,
        ownerEmail,
        expiresAt,
        renewUrl,
        yearsRemaining: Math.max(yearsRemaining, 1),
      });

      await sendEmailAsync({
        to:      ownerEmail,
        subject: `Your memorial for ${memorial.title} will expire in ${yearsRemaining} years`,
        html,
      });

      await prisma.memorial.update({
        where: { id: memorial.id },
        data:  { expiryWarningSentAt: new Date() },
      });

      await prisma.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId:   memorial.id,
          action:     AuditAction.EXPIRY_WARNING_SENT,
          actorId:    'SYSTEM',
          actorRole:  ActorRole.SYSTEM,
          reasonCode: ReasonCode.AUTOMATION,
          metadata:   { expiresAt, yearsRemaining, ownerEmail },
        },
      });

      sent++;
      console.log(`[expiryWarning] Sent for memorial ${memorial.id} to ${ownerEmail}`);

    } catch (err) {
      const msg = `Memorial ${memorial.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`[expiryWarning] Error — ${msg}`);
    }
  }

  return { processed, sent, errors };
}
