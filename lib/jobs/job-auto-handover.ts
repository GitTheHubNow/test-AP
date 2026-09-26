// lib/jobs/job-auto-handover.ts
//
// Auto-INITIATES handover a fixed number of days after the service —
// it does NOT complete it. This deliberately mirrors the manual
// "Start handover" flow in app/api/memorial/[memorialId]/handover/route.ts
// exactly: same MemorialHandover upsert, same acceptToken generation,
// same sendHandoverInitiated email. The only difference is *who* is
// triggering it (the system, on a schedule, instead of a staff member
// clicking a button) and *where the family contact comes from*
// (Memorial.nominatedEmail/nominatedName — the "email on file" — since
// there's no staff member filling in a form in this path).
//
// The family still has to click "Accept" in that email to actually take
// over the memorial (see app/api/handover/accept/[token]/route.ts) —
// this job only sends the invitation, it never transfers ownership
// silently. That was a deliberate product decision: automatic is fine
// for the *nudge*, not for the *transfer*.
//
// Guarded by MemorialHandover already existing (upsert is a no-op if
// staff already started handover manually — this job only fills the
// gap when nobody has).

import { prisma } from '@/lib/prisma';
import { MemorialStatus, HandoverStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { sendHandoverInitiated } from '@/lib/email/send';
import { isAutoHandoverDue } from '@/lib/memorial/journeyGate';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

// PRIORITY 3 FIX: this job used to read funeralDate/nominatedEmail/
// nominatedName straight off Memorial. For a case-linked memorial those
// columns can go stale once staff start editing family-contact details
// on the case instead — and this job doesn't just send an email off
// that data, it writes a permanent MemorialHandover record with the
// contact baked in as familyContactEmail/familyContactName. A stale
// value here isn't a display bug, it's an accept-link going to the
// wrong person. Every candidate is now resolved before use.

const SYSTEM_ACTOR = 'system';

export async function runAutoHandoverJob(): Promise<{ processed: number; initiated: number; errors: string[] }> {
  const errors: string[] = [];
  let initiated = 0;
  const now = new Date();

  const candidates = await prisma.memorial.findMany({
    where: {
      status: MemorialStatus.ACTIVE,
      // Widened for the same reason as the journey-automation jobs — a
      // case-linked memorial can have funeralDate/nominatedEmail: null
      // on its own columns while the case's serviceDate/contactEmail
      // are the real trigger and recipient.
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
      ownerId: true, organisationId: true,
      handover: { select: { id: true, status: true } },
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
      if (!isAutoHandoverDue(resolved.funeralDate, now)) continue;

      // Skip if staff already started handover manually (any status) or
      // it's already been completed — this job only fills the gap when
      // nobody has acted, it never overrides an existing handover.
      if (memorial.handover) continue;

      const memorialTitle = memorial.title
        || [resolved.firstName, resolved.lastName].filter(Boolean).join(' ')
        || 'the memorial';

      const acceptToken          = randomUUID();
      const acceptTokenExpiresAt = addDays(now, 30);
      const familyContactName    = resolved.nominatedName?.trim() || 'there';

      await prisma.$transaction(async (tx) => {
        const record = await tx.memorialHandover.create({
          data: {
            memorialId:           memorial.id,
            initiatedBy:          SYSTEM_ACTOR,
            status:               HandoverStatus.PENDING,
            familyContactName,
            familyContactEmail:   resolved.nominatedEmail!,
            familyContactPhone:   null,
            scheduledAt:          null,
            acceptToken,
            acceptTokenExpiresAt,
            previousOwnerId:      memorial.ownerId,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: EntityType.HANDOVER,
            entityId:   record.id,
            action:     AuditAction.HANDOVER_INITIATED,
            actorId:    SYSTEM_ACTOR,
            actorRole:  ActorRole.SYSTEM,
            reasonCode: ReasonCode.HANDOVER,
            metadata: {
              memorialId:         memorial.id,
              familyContactEmail: resolved.nominatedEmail,
              autoTriggered:      true,
            },
          },
        });
      });

      let funeralHomeName = 'the funeral home';
      if (memorial.organisationId) {
        const org = await prisma.organisation.findUnique({
          where:  { id: memorial.organisationId },
          select: { name: true },
        });
        funeralHomeName = org?.name ?? funeralHomeName;
      }

      try {
        await sendHandoverInitiated({
          familyEmail:       resolved.nominatedEmail,
          familyContactName,
          memorialId:        memorial.id,
          memorialTitle,
          funeralHomeName,
          acceptToken,
          expiresAt:         acceptTokenExpiresAt,
        });
      } catch (emailErr) {
        // Handover record was created either way — a failed email here
        // shouldn't be silently invisible, but it also shouldn't roll
        // back a handover that's otherwise valid. Matches the manual
        // route's own try/catch around its email send.
        console.error(`[autoHandover] Email failed for memorial ${memorial.id}:`, emailErr);
      }

      initiated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${memorial.id}: ${msg}`);
      console.error(`[autoHandover] Failed for memorial ${memorial.id}:`, err);
    }
  }

  return { processed, initiated, errors };
}
