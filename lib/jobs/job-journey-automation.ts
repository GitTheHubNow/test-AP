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
import { clerkClient } from '@clerk/nextjs/server';

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
      funeralDate:           { not: null },
      nominatedEmail:        { not: null },
      lastChanceEmailSentAt: null,
    },
    select: {
      id: true, title: true, firstName: true, lastName: true,
      funeralDate: true, nominatedEmail: true, nominatedName: true,
      uploadLinkToken: true, uploadLinkEnabled: true,
      organisation: { select: { name: true } },
    },
  });

  const processed = candidates.length;

  for (const memorial of candidates) {
    try {
      if (!memorial.funeralDate || !memorial.nominatedEmail) continue;
      if (!isLastChanceEmailDue(memorial.funeralDate, now)) continue;
      if (!memorial.uploadLinkEnabled || !memorial.uploadLinkToken) continue; // nothing to link to

      const memorialTitle = memorial.title
        || [memorial.firstName, memorial.lastName].filter(Boolean).join(' ')
        || 'the memorial';

      const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/upload/${memorial.uploadLinkToken}`;

      await sendLastChanceUpload({
        familyEmail:      memorial.nominatedEmail,
        familyName:       memorial.nominatedName ?? undefined,
        memorialId:       memorial.id,
        memorialTitle,
        funeralHomeName:  memorial.organisation?.name ?? 'the funeral home',
        uploadUrl,
        daysUntilService: Math.max(daysUntil(memorial.funeralDate, now), 0),
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
      status:             MemorialStatus.ACTIVE,
      funeralDate:        { not: null },
      publishPromptSentAt: null,
      workflowStage:      { not: 'LIVE' },
    },
    select: {
      id: true, title: true, firstName: true, lastName: true,
      funeralDate: true, ownerId: true, workflowStage: true,
    },
  });

  const processed = candidates.length;

  for (const memorial of candidates) {
    try {
      if (!memorial.funeralDate) continue;
      if (!isPublishPromptDue(memorial.funeralDate, now)) continue;
      if (memorial.workflowStage === 'HANDED_OVER') continue; // no longer staff's to publish

      const memorialTitle = memorial.title
        || [memorial.firstName, memorial.lastName].filter(Boolean).join(' ')
        || 'the memorial';

      const pendingCount = await prisma.memory.count({
        where: { memorialId: memorial.id, status: MemoryStatus.PENDING },
      });

      let ownerEmail: string | undefined;
      let ownerName:  string | undefined;
      try {
        const user = await clerkClient().users.getUser(memorial.ownerId);
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
