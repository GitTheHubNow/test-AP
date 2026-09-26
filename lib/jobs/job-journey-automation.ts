// lib/jobs/job-journey-automation.ts
//
// Two cron-driven reminders tied to Memorial.funeralDate, using the same
// timing rules the sidebar lock/unlock uses (lib/memorial/journeyGate.ts)
// so the emails and the UI never disagree about "how many days out".
//
// Job A — Last chance to upload:
//   Fires once, ~5 days before the service, to the family/nominated
//   contact on file (Memorial.nominatedEmail — the same field
//   job-send-after-days.ts already uses for "share this memorial").
//   Guarded by Memorial.lastChanceEmailSentAt so it never repeats.
//
// Job B — Ready to publish:
//   Fires once, the day before the service, to the memorial owner —
//   a nudge to review pending content, publish, and download the
//   tribute video ahead of the service. Guarded by
//   Memorial.publishPromptSentAt.
//
// Both jobs are read-heavy, write-light: a single findMany + a per-row
// try/catch so one bad row can't take down the whole batch (same
// isolation pattern as runSendAfterDaysJob).
//
// NEW FIELDS THIS JOB DEPENDS ON (see migration note in PR/README):
//   Memorial.lastChanceEmailSentAt  DateTime?
//   Memorial.publishPromptSentAt    DateTime?
//   Memorial.tributeUnlockOverride  Boolean  @default(false)
//   Memorial.nominatedName          String?  (optional — falls back to
//                                              "the family" in the email
//                                              if not set)

import { prisma } from '@/lib/prisma';
import { MemorialStatus, MemoryStatus } from '@prisma/client';
import { sendLastChanceUpload, sendPublishPrompt } from '@/lib/email/send';
import { isLastChanceEmailDue, isPublishPromptDue } from '@/lib/memorial/journeyGate';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';
import { clerkClient } from '@clerk/nextjs/server';

// PRIORITY 3 FIX: both jobs below used to read funeralDate/nominatedEmail/
// nominatedName straight off Memorial, with no funeralCase join. For a
// case-linked memorial, staff now edit those fields on the CASE, not the
// memorial — so a stale memorial column here could fire an automated
// email on the wrong day, or to a family contact who is no longer current
// (see resolveMemorialFields.ts). Every candidate is now resolved before
// use. Memorials with no linked case behave exactly as before.

function daysUntil(target: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export async function runLastChanceUploadJob(): Promise<{ processed: number; sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  const now = new Date();

  const candidates = await prisma.memorial.findMany({
    where: {
      status:                MemorialStatus.ACTIVE,
      lastChanceEmailSentAt: null,
      // Widened so a case-linked memorial isn't silently skipped just
      // because its OWN funeralDate/nominatedEmail columns are null —
      // the case's serviceDate/contactEmail are equally valid triggers
      // once resolveMemorialFields() is applied below. Un-linked
      // memorials are unaffected (their case-side OR branch can never
      // match since funeralCase is null).
      OR: [
        { funeralDate: { not: null }, nominatedEmail: { not: null } },
        {
          funeralCase: {
            serviceDate:  { not: null },
            contactEmail: { not: null },
          },
        },
      ],
    },
    select: {
      id: true, title: true, firstName: true, lastName: true,
      funeralDate: true, nominatedEmail: true, nominatedName: true,
      venueName: true, venueAddress: true,
      uploadLinkToken: true, uploadLinkEnabled: true,
      organisation: { select: { name: true } },
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
      const resolved = resolveMemorialFields(memorial);

      if (!resolved.funeralDate || !resolved.nominatedEmail) continue;
      if (!isLastChanceEmailDue(resolved.funeralDate, now)) continue;
      if (!memorial.uploadLinkEnabled || !memorial.uploadLinkToken) continue; // nothing to link to

      const memorialTitle = memorial.title
        || [resolved.firstName, resolved.lastName].filter(Boolean).join(' ')
        || 'the memorial';

      const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/upload/${memorial.uploadLinkToken}`;

      await sendLastChanceUpload({
        familyEmail:      resolved.nominatedEmail,
        familyName:       resolved.nominatedName ?? undefined,
        memorialId:       memorial.id,
        memorialTitle,
        funeralHomeName:  memorial.organisation?.name ?? 'the funeral home',
        uploadUrl,
        daysUntilService: Math.max(daysUntil(resolved.funeralDate, now), 0),
      });

      await prisma.memorial.update({
        where: { id: memorial.id },
        data:  { lastChanceEmailSentAt: now },
      });

      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${memorial.id}: ${msg}`);
      console.error(`[lastChanceUpload] Failed for memorial ${memorial.id}:`, err);
    }
  }

  return { processed, sent, errors };
}

export async function runPublishPromptJob(): Promise<{ processed: number; sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  const now = new Date();

  const candidates = await prisma.memorial.findMany({
    where: {
      status:              MemorialStatus.ACTIVE,
      publishPromptSentAt: null,
      workflowStage:       { not: 'LIVE' },
      // Widened for the same reason as runLastChanceUploadJob above —
      // a case-linked memorial can have funeralDate: null on its own
      // column while the case's serviceDate is the real trigger date.
      OR: [
        { funeralDate: { not: null } },
        { funeralCase: { serviceDate: { not: null } } },
      ],
    },
    select: {
      id: true, title: true, firstName: true, lastName: true,
      funeralDate: true, ownerId: true, workflowStage: true,
      // Required by resolveMemorialFields()'s input shape even though
      // this job only cares about firstName/lastName/funeralDate — the
      // resolver takes the full field set as one bundle (see the same
      // note on job-send-after-days.ts).
      nominatedName:  true,
      nominatedEmail: true,
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
      const resolved = resolveMemorialFields(memorial);

      if (!resolved.funeralDate) continue;
      if (!isPublishPromptDue(resolved.funeralDate, now)) continue;
      if (memorial.workflowStage === 'HANDED_OVER') continue; // no longer staff's to publish

      const memorialTitle = memorial.title
        || [resolved.firstName, resolved.lastName].filter(Boolean).join(' ')
        || 'the memorial';

      const pendingCount = await prisma.memory.count({
        where: { memorialId: memorial.id, status: MemoryStatus.PENDING },
      });

      let ownerEmail: string | undefined;
      let ownerName:  string | undefined;
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(memorial.ownerId);
        ownerEmail = user.emailAddresses?.[0]?.emailAddress;
        ownerName  = user.firstName ?? undefined;
      } catch (err) {
        console.warn(`[publishPrompt] Could not look up owner for memorial ${memorial.id}:`, err);
      }
      if (!ownerEmail) continue; // nothing to send to

      await sendPublishPrompt({
        ownerEmail,
        ownerName,
        memorialId:    memorial.id,
        memorialTitle,
        pendingCount,
      });

      await prisma.memorial.update({
        where: { id: memorial.id },
        data:  { publishPromptSentAt: now },
      });

      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${memorial.id}: ${msg}`);
      console.error(`[publishPrompt] Failed for memorial ${memorial.id}:`, err);
    }
  }

  return { processed, sent, errors };
}
