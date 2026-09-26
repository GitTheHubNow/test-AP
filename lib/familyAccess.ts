// lib/familyAccess.ts
//
// Family self-service memorial control — deliberately NOT built on Clerk
// or Memorial.ownerId. Every existing permission check in this codebase
// (assertMemorialAccess in lib/auth/getOrgForUser.ts) treats the owner as
// having unconditional full access. Making a family member a real owner,
// even via a frictionless passwordless Clerk flow, would hand them
// moderation/approval rights they were explicitly never meant to have.
//
// This is a separate, narrower door: a signed cookie scoped to exactly
// one memorialId, granted after confirming the visitor's email matches
// MemorialHandover.familyContactEmail, checked independently on every
// request against live DB state (not just the cookie's signature) so a
// funeral home revoking access takes effect immediately even for
// visitors already holding a valid-looking cookie.
//
// Requires FAMILY_SESSION_SECRET in the environment — a dedicated
// secret, not reused from IP_HASH_SALT or CRON_SECRET. Mixing a secret's
// purpose across unrelated systems means rotating one for a real reason
// (a suspected leak) silently breaks or weakens the other.

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuditAction, EntityType, ReasonCode } from '@/lib/audit';
import { sendFamilyAccessGranted } from '@/lib/email/send';

const COOKIE_NAME = 'family_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year — "remember them" per product decision

function getSecret(): string {
  const secret = process.env.FAMILY_SESSION_SECRET;
  if (!secret) {
    // Fail closed, loudly, at the point of use — not a silent fallback
    // to an empty/guessable secret. See lib/env.ts for the boot-time
    // check that should catch this before it ever gets here in practice.
    throw new Error('FAMILY_SESSION_SECRET is not set');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Generates a new, unguessable family access token — same style as lib/qr.ts's long tokens. */
export function generateFamilyAccessToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Builds the signed cookie value for a given handover. The cookie
 * encodes handoverId + memorialId + a signature — not the family's
 * email, so the cookie itself never carries the PII being verified.
 */
function buildSessionValue(handoverId: string, memorialId: string): string {
  const payload = `${handoverId}.${memorialId}`;
  return `${payload}.${sign(payload)}`;
}

/** Parses and verifies a cookie value's signature. Returns null on any mismatch or malformed input — never throws on bad input, since this runs on every request including ones with a stale or tampered cookie. */
function parseSessionValue(value: string): { handoverId: string; memorialId: string } | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [handoverId, memorialId, signature] = parts;
  const expected = sign(`${handoverId}.${memorialId}`);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null; // timingSafeEqual throws on length mismatch
  if (!timingSafeEqual(a, b)) return null;

  return { handoverId, memorialId };
}

/** Called after a successful email verification — issues the long-lived cookie. */
export async function setFamilySessionCookie(handoverId: string, memorialId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, buildSessionValue(handoverId, memorialId), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax', // must survive a top-level navigation from an emailed/texted link
    maxAge:   COOKIE_MAX_AGE_SECONDS,
    path:     '/',
  });
}

export class FamilyAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * The family-access equivalent of assertMemorialAccess. Verifies the
 * cookie's signature AND re-checks live DB state on every call — a
 * cryptographically valid cookie for a handover that's since been
 * revoked, cancelled, or had family access turned off must fail here,
 * not just at cookie-issue time.
 *
 * Throws FamilyAccessError (with .status) on any failure, matching the
 * throw-with-status convention already used by assertMemorialAccess, so
 * route handlers can catch both the same way.
 */
export async function assertFamilyAccess(memorialId: string): Promise<{ handoverId: string }> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;

  if (!raw) {
    throw new FamilyAccessError('Not signed in', 401);
  }

  const parsed = parseSessionValue(raw);
  if (!parsed) {
    throw new FamilyAccessError('Invalid session', 401);
  }

  if (parsed.memorialId !== memorialId) {
    // The cookie is valid, just not for THIS memorial — a family member
    // with access to memorial A must not be able to reuse that same
    // cookie against memorial B by editing a URL.
    throw new FamilyAccessError('This session does not grant access to this memorial', 403);
  }

  const handover = await prisma.memorialHandover.findUnique({
    where:  { id: parsed.handoverId },
    select: {
      memorialId:            true,
      status:                true,
      familyAccessEnabled:   true,
      familyAccessRevokedAt: true,
    },
  });

  if (!handover || handover.memorialId !== memorialId) {
    throw new FamilyAccessError('Invalid session', 401);
  }

  if (handover.status !== 'COMPLETED') {
    throw new FamilyAccessError('Handover is not complete', 403);
  }

  if (!handover.familyAccessEnabled || handover.familyAccessRevokedAt) {
    // Funeral home turned this off after the cookie was issued — fail
    // closed immediately, don't wait for the cookie to expire naturally.
    throw new FamilyAccessError('Family access has been disabled for this memorial', 403);
  }

  return { handoverId: parsed.handoverId };
}

/**
 * Generates a family access token for a COMPLETED handover and emails
 * it. Callable from anywhere a handover might complete — the staff
 * "generate/resend" route AND the automatic grant at the moment the
 * existing Clerk-based accept flow completes (see
 * app/api/handover/accept/[token]/route.ts) — not exported from a
 * route.ts file, since Next.js's App Router rejects any named export
 * from a route file other than the HTTP method handlers themselves.
 */
export async function grantFamilyAccess(
  memorialId: string,
  actorId: string,
  actorRole: string,
): Promise<{ ok: true; familyAccessToken: string } | { ok: false; error: string }> {
  const handover = await prisma.memorialHandover.findUnique({
    where:  { memorialId },
    select: { id: true, status: true, familyContactName: true, familyContactEmail: true },
  });
  if (!handover) return { ok: false, error: 'No handover exists for this memorial' };
  if (handover.status !== 'COMPLETED') return { ok: false, error: 'Handover is not complete' };

  const memorial = await prisma.memorial.findUnique({ where: { id: memorialId }, select: { title: true } });
  if (!memorial) return { ok: false, error: 'Memorial not found' };

  const familyAccessToken = generateFamilyAccessToken();

  await prisma.memorialHandover.update({
    where: { id: handover.id },
    data:  { familyAccessToken, familyAccessEnabled: true, familyAccessRevokedAt: null },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: EntityType.MEMORIAL, entityId: memorialId,
      action: AuditAction.UPDATE, actorId, actorRole,
      reasonCode: ReasonCode.FAMILY_SELF_SERVICE,
      metadata: { grantedFamilyAccess: true },
    },
  });

  await sendFamilyAccessGranted({
    familyEmail:       handover.familyContactEmail,
    familyContactName: handover.familyContactName,
    memorialId,
    memorialTitle:      memorial.title,
    familyAccessToken,
  });

  return { ok: true, familyAccessToken };
}
