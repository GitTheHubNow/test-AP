// lib/memorial/createMemorial.ts
//
// Shared memorial-creation logic, extracted from app/api/memorial/route.ts
// so it can be called from multiple places (the manual creation API route,
// and CSV bulk import auto-create) without the two call sites drifting out
// of sync over time — see the FuneralCase/notificationPrefs migration mess
// earlier in this project's history for why that drift is worth avoiding.
//
// app/api/memorial/route.ts now delegates to this function; its behaviour
// is unchanged, this is a pure extraction.

import { prisma } from '@/lib/prisma';
import { randomUUID, createHash } from 'crypto';
import { addDays } from 'date-fns';
// No quantity cap — only whether the account has been suspended. See the
// lib/entitlement.ts header comment.
import { checkAccountActive } from '@/lib/entitlement';
// Every memorial writes one usage-ledger row in the same transaction.
// See lib/billing/usage.ts.
import { recordUsage } from '@/lib/billing/usage';
import { generateUniqueSlug } from '@/lib/memorial/slug';
import { generatePublicToken } from '@/lib/qr';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';
import { validateMemorialInput } from '@/lib/memorial/validateInput';

/**
 * Max memorials a site can create while its FREE TRIAL is running. Trial
 * memorials are billed at $0, so without a cap a throwaway sign-up could mint
 * unlimited free memorials (and storage). Paying sites (no trial / trial over)
 * are never capped. Override with TRIAL_MEMORIAL_LIMIT; 0 disables the cap.
 */
function getTrialMemorialLimit(): number {
  const raw = process.env.TRIAL_MEMORIAL_LIMIT;
  if (raw === undefined || raw.trim() === '') return 10;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 10;
}

export interface CreateMemorialInput {
  ownerId:              string;   // Clerk userId — attributed creator
  organisationId:       string;
  firstName:            string;
  lastName:             string;
  preferredName?:       string;
  dateOfBirth?:         string;
  dateOfDeath?:         string;
  placeOfPassing?:      string;
  funeralDate?:         string;
  serviceType?:         string;
  serviceTime?:         string;   // ISO datetime string
  venueName?:           string;
  venueAddress?:        string;
  familyContactName?:   string;
  familyContactEmail?:  string;
  familyContactPhone?:  string;
  isAboriginal?:            boolean;
  isTorresStraitIslander?:  boolean;
  isSouthSeaIslander?:      boolean;
  isMaori?:                 boolean;
  nominatedEmail?: string;
  sendAfterDays?:  number;
  /**
   * If set, an identical-looking memorial (same owner + org + name) created
   * within this many ms is returned instead of creating a second one — so a
   * double-click or network retry can't create (and bill) two. The manual
   * form opts in; CSV import does NOT (a CSV can legitimately hold two
   * people with the same name).
   */
  dedupeWindowMs?: number;
}

export type CreateMemorialResult =
  | { ok: true; memorial: { id: string; title: string; slug: string; qrTokenHash: string; uploadLinkToken: string; workflowStage: string } }
  // 'plan_limit' is now only returned for a SUSPENDED account (kept as the
  // kind name so existing callers — app/api/memorial/route.ts and the CSV
  // import — keep working unchanged).
  | { ok: false; kind: 'validation' | 'plan_limit' | 'server_error'; error: string; code?: string };

export async function createMemorial(input: CreateMemorialInput): Promise<CreateMemorialResult> {
  const invalid = validateMemorialInput(input as unknown as Record<string, unknown>);
  if (invalid) return { ok: false, kind: 'validation', error: invalid };

  const firstName = input.firstName.trim();
  const lastName  = input.lastName.trim();

  // No quantity cap for paying sites — every memorial is recorded in the
  // usage ledger and billed on the site's monthly statement. This blocks a
  // SUSPENDED account, and caps a site that is still inside its free trial.
  const entitlement = await checkAccountActive(input.organisationId);
  if (!entitlement.allowed) {
    return { ok: false, kind: 'plan_limit', error: entitlement.reason ?? 'Account suspended', code: 'ACCOUNT_SUSPENDED' };
  }

  const trialLimit = getTrialMemorialLimit();
  if (trialLimit > 0) {
    const org = await prisma.organisation.findUnique({
      where:  { id: input.organisationId },
      select: { trialEndsAt: true },
    });
    if (org?.trialEndsAt && org.trialEndsAt.getTime() > Date.now()) {
      const existing = await prisma.memorial.count({ where: { organisationId: input.organisationId } });
      if (existing >= trialLimit) {
        return {
          ok: false, kind: 'plan_limit', code: 'TRIAL_LIMIT_REACHED',
          error: `Your free trial includes up to ${trialLimit} memorials. Please contact support to continue.`,
        };
      }
    }
  }

  if (input.dedupeWindowMs && input.dedupeWindowMs > 0) {
    const dup = await prisma.memorial.findFirst({
      where: {
        ownerId: input.ownerId, organisationId: input.organisationId,
        firstName, lastName,
        createdAt: { gte: new Date(Date.now() - input.dedupeWindowMs) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, slug: true, qrTokenHash: true, uploadLinkToken: true, workflowStage: true },
    });
    if (dup && dup.slug && dup.uploadLinkToken) {
      return {
        ok: true,
        memorial: {
          id: dup.id, title: dup.title, slug: dup.slug, qrTokenHash: dup.qrTokenHash,
          uploadLinkToken: dup.uploadLinkToken, workflowStage: dup.workflowStage,
        },
      };
    }
  }

  const title = `${firstName} ${lastName}`;

  const qrTokenHash = createHash('sha256')
    .update(`${input.ownerId}-${title}-${Date.now()}-${randomUUID()}`)
    .digest('hex')
    .slice(0, 32);

  const uploadLinkToken = randomUUID();

  // Generated outside the transaction below — generateUniqueSlug does its
  // own uniqueness-check query, which is simplest to resolve before we
  // open the memorial-creation transaction rather than nesting it inside.
  try {
    const slug = await generateUniqueSlug(firstName, lastName);

    const memorial = await prisma.$transaction(async (tx) => {
      const mem = await tx.memorial.create({
        data: {
          ownerId:                input.ownerId,
          organisationId:         input.organisationId,
          title,
          firstName,
          lastName,
          slug,
          preferredName:          input.preferredName?.trim()      || null,
          birthDate:              input.dateOfBirth  ? new Date(input.dateOfBirth)  : null,
          deathDate:              input.dateOfDeath  ? new Date(input.dateOfDeath)  : null,
          placeOfPassing:         input.placeOfPassing?.trim()     || null,
          funeralDate:            input.funeralDate  ? new Date(input.funeralDate)  : null,
          serviceType:            input.serviceType                || null,
          serviceTime:            input.serviceTime  ? new Date(input.serviceTime)  : null,
          venueName:              input.venueName?.trim()          || null,
          venueAddress:           input.venueAddress?.trim()       || null,
          familyContactName:      input.familyContactName?.trim()  || null,
          familyContactEmail:     input.familyContactEmail?.trim() || null,
          familyContactPhone:     input.familyContactPhone?.trim() || null,
          isAboriginal:           input.isAboriginal           ?? false,
          isTorresStraitIslander: input.isTorresStraitIslander ?? false,
          isSouthSeaIslander:     input.isSouthSeaIslander     ?? false,
          isMaori:                input.isMaori                ?? false,
          nominatedEmail:         input.nominatedEmail?.trim() || input.familyContactEmail?.trim() || null,
          sendAfterDays:          input.sendAfterDays          || null,
          qrTokenHash,
          uploadLinkToken,
          uploadLinkEnabled:      true,
          // Issued at creation so the public link (/v/{slug}?key={publicToken})
          // exists from the first moment. Previously generated lazily on first
          // QR-panel open, leaving new memorials with no public URL.
          publicToken:            generatePublicToken(),
          workflowStage:          'COLLECTING',
        },
      });

      // FIXED: this transaction never wrote a CREATE audit event, meaning
      // every memorial ever made through this function (the live creation
      // path — both the manual creation API route and CSV bulk import)
      // was missing its creation audit record. Written inside the same
      // transaction as the memorial itself so the two can never drift —
      // either both are committed or neither is, matching the pattern
      // sealMemorial()/sealMemory() already use in lib/immutability.ts.
      await tx.auditEvent.create({
        data: {
          entityType: EntityType.MEMORIAL,
          entityId:   mem.id,
          action:     AuditAction.CREATE,
          actorId:    input.ownerId,
          actorRole:  ActorRole.OWNER,
          reasonCode: ReasonCode.CREATION,
          metadata: {
            title,
            organisationId: input.organisationId,
          },
        },
      });

      await tx.memorialSettings.create({ data: { memorialId: mem.id } });
      await tx.entitlement.create({ data: { memorialId: mem.id, tier: 'FREE' } });

      // BILLING: one ledger row per memorial, in the SAME transaction as the
      // memorial itself — so a memorial can never exist unbilled, and a
      // rolled-back creation never leaves a billed ghost. Idempotent on
      // (type, memorialId); the price is frozen here from the site's rates
      // and trial state. See lib/billing/usage.ts.
      await recordUsage(tx, {
        organisationId: input.organisationId,
        type:           'MEMORIAL_CREATED',
        memorialId:     mem.id,
        memorialTitle:  title,
      });

      if (input.familyContactEmail?.trim()) {
        const funeralDate = input.funeralDate ? new Date(input.funeralDate) : null;
        const scheduledAt = funeralDate ? addDays(funeralDate, 7) : null;

        await tx.memorialHandover.create({
          data: {
            memorialId:           mem.id,
            initiatedBy:          input.ownerId,
            status:               scheduledAt ? 'SCHEDULED' : 'PENDING',
            familyContactName:    input.familyContactName?.trim()  || '',
            familyContactEmail:   input.familyContactEmail.trim(),
            familyContactPhone:   input.familyContactPhone?.trim() || null,
            scheduledAt,
            acceptToken:          randomUUID(),
            acceptTokenExpiresAt: addDays(new Date(), 90),
            previousOwnerId:      input.ownerId,
          },
        });
      }

      return mem;
    });

    return {
      ok: true,
      memorial: {
        id:              memorial.id,
        title:           memorial.title,
        slug:            memorial.slug!, // non-null: always set via generateUniqueSlug above
        qrTokenHash:     memorial.qrTokenHash,
        // Non-null: uploadLinkToken is always set to a fresh randomUUID()
        // in the create() call above — Prisma's generated type is
        // string|null only because the *column* is nullable (older rows /
        // other write paths could in theory leave it unset), not because
        // this particular creation path can produce one.
        uploadLinkToken: memorial.uploadLinkToken!,
        workflowStage:   memorial.workflowStage,
      },
    };
  } catch (error) {
    console.error('[createMemorial]', error);
    return { ok: false, kind: 'server_error', error: 'Failed to create memorial' };
  }
}
