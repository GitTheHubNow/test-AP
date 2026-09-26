import { prisma } from '@/lib/prisma';
import { MemorialStatus } from '@prisma/client';
import { sendEmailAsync, getMemorialUrl, getDashboardUrl } from '@/lib/email';
import { generateMemorialQR } from '@/lib/qr';
import { renderSendAfterDaysEmail } from '@/lib/email-templates/automation-emails';
import { clerkClient } from '@clerk/nextjs/server';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { randomUUID } from 'crypto';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

// PRIORITY 3 FIX: nominatedEmail used to be read straight off Memorial.
// For a case-linked memorial the current family contact lives on the
// case (Memorial.nominatedEmail can go stale once staff stop editing it
// directly) — a stale value here means this job shares the memorial
// link with someone who is no longer the right contact.

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
      status:        MemorialStatus.ACTIVE,
      autoSentAt:    null,
      sendAfterDays: { not: null },
      deathDate:     { not: null },
      // Widened so a case-linked memorial with nominatedEmail: null on
      // its own column (but a real contactEmail on the case) isn't
      // silently skipped. deathDate is NOT a case-resolved field (see
      // resolveMemorialFields.ts field list), so it stays a plain
      // not-null check above rather than part of the OR.
      OR: [
        { nominatedEmail: { not: null } },
        { funeralCase: { contactEmail: { not: null } } },
      ],
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
      // Needed only to resolve nominatedEmail via resolveMemorialFields
      // when this memorial is case-linked. firstName/lastName/funeralDate/
      // venueName/venueAddress/nominatedName aren't otherwise used by
      // this job, but the resolver requires the full field set.
      firstName:      true,
      lastName:       true,
      nominatedName:  true,
      funeralDate:    true,
      venueName:      true,
      venueAddress:   true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
    },
  });

  const processed = candidates.length;

  for (const memorial of candidates) {
    try {
      const resolvedEmail = resolveMemorialFields(memorial).nominatedEmail;
      if (!resolvedEmail) continue; // widened OR above can admit a row with no usable email either side

      // Check if trigger date has passed
      const triggerDate = new Date(memorial.deathDate!);
      triggerDate.setDate(triggerDate.getDate() + memorial.sendAfterDays!);
      triggerDate.setHours(0, 0, 0, 0);

      if (triggerDate > today) continue; // not yet

      // Get owner name for email personalisation
      let ownerName: string | undefined;
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(memorial.ownerId);
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
        to:      resolvedEmail,
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
          metadata:   { nominatedEmail: resolvedEmail, sendAfterDays: memorial.sendAfterDays },
        },
      });

      sent++;
      console.log(`[sendAfterDays] Sent for memorial ${memorial.id} to ${resolvedEmail}`);

    } catch (err) {
      const msg = `Memorial ${memorial.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error(`[sendAfterDays] Error — ${msg}`);
    }
  }

  return { processed, sent, errors };
}
