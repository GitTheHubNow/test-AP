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
import { checkEntitlement, incrementUsage } from '@/lib/entitlement';
import { generateUniqueSlug } from '@/lib/memorial/slug';
import { EntityType, AuditAction, ActorRole, ReasonCode } from '@/lib/audit';

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
}

export type CreateMemorialResult =
  | { ok: true; memorial: { id: string; title: string; slug: string; qrTokenHash: string; uploadLinkToken: string; workflowStage: string } }
  | { ok: false; kind: 'validation' | 'plan_limit' | 'server_error'; error: string };

export async function createMemorial(input: CreateMemorialInput): Promise<CreateMemorialResult> {
  const firstName = input.firstName.trim();
  const lastName  = input.lastName.trim();

  if (!firstName) return { ok: false, kind: 'validation', error: 'firstName is required' };
  if (!lastName)  return { ok: false, kind: 'validation', error: 'lastName is required' };

  const entitlement = await checkEntitlement(input.organisationId, 'memorialsPerMonth');
  if (!entitlement.allowed) {
    return { ok: false, kind: 'plan_limit', error: entitlement.reason ?? 'Plan limit reached' };
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
  const slug = await generateUniqueSlug(firstName, lastName);

  try {
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

    await incrementUsage(input.organisationId, 'memorialsThisMonth');

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
