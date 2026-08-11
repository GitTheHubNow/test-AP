import { prisma } from '@/lib/prisma';
import { MemorialStatus } from '@prisma/client';
import { sendEmailAsync, getMemorialUrl, getDashboardUrl } from '@/lib/email';
import { generateMemorialQR } from '@/lib/qr';
import { renderSendAfterDaysEmail } from '@/lib/email-templates/automation-emails';
import { clerkClient } from '@clerk/nextjs/server';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { randomUUID } from 'crypto';

/**
 * job-send-after-days.ts
 *
 * Finds ACTIVE memorials where:
 * - sendAfterDays is set
 * - deathDate is set
 * - nominatedEmail is set
 * - autoSentAt is null (not yet sent)
 * - deathDate + sendAfterDays <= today
 *
 * Sends the memorial link + QR to the nominated email address.
 * Marks autoSentAt to prevent resend.
 *
 * Phase 10
 */
export async function runSendAfterDaysJob(): Promise<{
  processed: number;
  sent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sent = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find candidates — memorials where the trigger date has passed
  const candidates = await prisma.memorial.findMany({
    where: {
      status:         MemorialStatus.ACTIVE,
      autoSentAt:     null,
      nominatedEmail: { not: null },
      sendAfterDays:  { not: null },
      deathDate:      { not: null },
    },
    select: {
      id:             true,
      title:          true,
      ownerId:        true,
      deathDate:      true,
      sendAfterDays:  true,
      nominatedEmail: true,
      qrTokenHash:    true,
      slug:           true,
      publicToken:    true,
    },
  });

  const processed = candidates.length;

  for (const memorial of candidates) {
    try {
      // Check if trigger date has passed
      const triggerDate = new Date(memorial.deathDate!);
      triggerDate.setDate(triggerDate.getDate() + memorial.sendAfterDays!);
      triggerDate.setHours(0, 0, 0, 0);

      if (triggerDate > today) continue; // not yet

      // Get owner name for email personalisation
      let ownerName: string | undefined;
      try {
        const user = await clerkClient().users.getUser(memorial.ownerId);
        ownerName = user.firstName ?? user.emailAddresses?.[0]?.emailAddress;
      } catch (error) {
        // Non-blocking — email still sends without owner name. This runs
        // unattended as a cron job with no one watching a UI, so a
        // silent failure here was previously invisible unless someone
        // happened to be tailing logs at the right moment; warn is cheap
        // and doesn't change the intentional non-blocking fallback.
        console.warn(
          `[job-send-after-days] Clerk lookup failed for owner ${memorial.ownerId}, sending without personalisation:`,
          error,
        );
      }

      // We need the raw QR token to build the public URL.
      // We only store the hash — so we generate a fresh QR using the memorial ID
      // as a stable seed. Actually we need the real token from the hash lookup.
      // Since we can't reverse the hash, we build the URL from the dashboard instead
      // and include a QR of the dashboard link pointing to the memorial.
      // Best practice: store the raw token encrypted, but for now use the hash to
      // look up and reconstruct the public URL pattern.
      // Previously this could only send the dashboard URL as a fallback —
      // qrTokenHash is a one-way hash, not reversible into a usable
      // public link. Now that memorials have `slug` (public, readable)
      // and `publicToken` (the real access secret, forward-usable), we
      // can finally send the actual public memorial link as originally
      // intended, not just a link to the owner's dashboard.
      let publicToken = memorial.publicToken;
      if (!publicToken) {
        publicToken = randomUUID().replace(/-/g, '').slice(0, 24);
        await prisma.memorial.update({
          where: { id: memorial.id },
          data:  { publicToken },
        });
      }
      const urlSlug = memorial.slug ?? memorial.id;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://memoriam.app';
      const realPublicUrl = `${appUrl}/v/${urlSlug}?key=${publicToken}`;

      // Generate QR of the actual public memorial link — no longer a
      // dashboard-link fallback.
      const qrResult = await generateMemorialQR(urlSlug, publicToken);
      const qrCodeDataUrl = qrResult.success ? qrResult.dataUrl : undefined;

      const html = renderSendAfterDaysEmail({
        memorialTitle: memorial.title,
        publicUrl:     realPublicUrl,
        qrCodeDataUrl,
        ownerName,
      });

      await sendEmailAsync({
        to:      memorial.nominatedEmail!,
        subject: `A memorial has been shared with you — ${memorial.title}`,
        html,
      });

      // Mark as sent
      await prisma.memorial.update({
        where: { id: memorial.id },
        data:  { autoSentAt: new Date() },
      });

      // Audit log
      await prisma.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId:   memorial.id,
          action:     AuditAction.AUTO_EMAIL_SENT,
          actorId:    'SYSTEM',
          actorRole:  ActorRole.SYSTEM,
          reasonCode: ReasonCode.AUTOMATION,
          metadata:   { nominatedEmail: memorial.nominatedEmail, sendAfterDays: memorial.sendAfterDays },
        },
      });

      sent++;
      console.log(`[sendAfterDays] Sent for memorial ${memorial.id} to ${memorial.nominatedEmail}`);

    } catch (err) {
      const msg = `Memorial ${memorial.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`[sendAfterDays] Error — ${msg}`);
    }
  }

  return { processed, sent, errors };
}
