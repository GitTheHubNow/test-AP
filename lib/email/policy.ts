// lib/email/policy.ts
//
// Central email policy engine.
//
// RULES:
//   1. Platform defaults define which email types are on/off.
//   2. Organisation.notificationPrefs can override per-type.
//   3. Batch types (MODERATION_DIGEST, UPLOAD_DIGEST) enforce a
//      per-memorial cooldown — only one email per cooldown window.
//   4. renderApprovedEmail is permanently suppressed — owner just
//      performed the action, confirmation is noise.
//
// USAGE:
//   const ok = await shouldSend(orgId, 'MODERATION_DIGEST', memorialId);
//   if (ok) sendEmailAsync({ ... });

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logError } from '@/lib/errors';

// ── Email type registry ───────────────────────────────────────────────────────

export type EmailType =
  | 'WELCOME'               // memorial created → owner
  | 'NEW_MEMORY_DIGEST'     // new memories need moderation → owner (batched)
  | 'UPLOAD_DIGEST'         // new uploads need moderation → owner (batched)
  | 'STALE_PENDING'         // 30+ day old pending memories → owner (cron)
  | 'HANDOVER_INITIATED'    // handover created → family contact
  | 'HANDOVER_ACCEPTED_FH'  // handover accepted → funeral home
  | 'HANDOVER_ACCEPTED_FAM' // handover accepted → family (confirmation)
  | 'FAMILY_ACCESS_GRANTED' // family self-service QR/link generated → family
  | 'EXPIRY_WARNING'        // 5 years before expiry → owner (cron)
  | 'MEMORIAL_SUSPENDED'    // on expiry → owner (cron)
  | 'PRODUCT_STATUS'        // product request status change → opt-in only
  | 'APPROVED_CONFIRMATION' // SUPPRESSED — owner just did the action
  | 'LAST_CHANCE_UPLOAD'    // 5 days before service → family (cron)
  | 'PUBLISH_PROMPT'        // 1 day before service → owner/staff (cron)
  | 'PAYMENT_FAILED'        // Stripe invoice.payment_failed → org owner

// ── Platform defaults ─────────────────────────────────────────────────────────
// true  = send by default, org can opt out
// false = suppressed by default, org must opt in

const PLATFORM_DEFAULTS: Record<EmailType, boolean> = {
  WELCOME:               true,
  NEW_MEMORY_DIGEST:     true,
  UPLOAD_DIGEST:         true,
  STALE_PENDING:         true,
  HANDOVER_INITIATED:    true,
  HANDOVER_ACCEPTED_FH:  true,
  HANDOVER_ACCEPTED_FAM: true,
  // Deliberately not overridable to false via notificationPrefs (see
  // shouldSend below) — same reasoning as PAYMENT_FAILED. This email
  // IS the delivery mechanism for the family's access link/QR; there's
  // no other way for them to get it if an org disables this type.
  FAMILY_ACCESS_GRANTED: true,
  EXPIRY_WARNING:        true,
  MEMORIAL_SUSPENDED:    true,
  PRODUCT_STATUS:        false,  // opt-in only
  APPROVED_CONFIRMATION: false,  // permanently suppressed — noise
  LAST_CHANCE_UPLOAD:    true,
  PUBLISH_PROMPT:        true,
  // Deliberately not overridable to false via notificationPrefs (see
  // shouldSend below) — an org should never be able to silently miss
  // a failed payment, since the consequence is losing the ability to
  // create new memorials with no other warning.
  PAYMENT_FAILED:        true,
};

// ── Batch cooldown windows (ms) ───────────────────────────────────────────────
// For digest types: track last-sent in DB metadata, suppress within window.

const BATCH_COOLDOWN_MS: Partial<Record<EmailType, number>> = {
  NEW_MEMORY_DIGEST:  60 * 60 * 1000,       // 1 hour
  UPLOAD_DIGEST:      60 * 60 * 1000,       // 1 hour
  STALE_PENDING:      7 * 24 * 60 * 60 * 1000, // 7 days
  // One-shot-per-memorial reminders — the cron job also checks its own
  // sentAt-style flag before calling shouldSend, but a long cooldown
  // here is a second line of defence against an accidental double send
  // (e.g. cron running twice in the same window).
  LAST_CHANCE_UPLOAD:  6 * 24 * 60 * 60 * 1000, // 6 days
  PUBLISH_PROMPT:      2 * 24 * 60 * 60 * 1000, // 2 days
};

// ── NotificationPrefs shape stored in Organisation.notificationPrefs ──────────

interface NotificationPrefs {
  overrides?: Partial<Record<EmailType, boolean>>;
  // lastSent tracks batch email timestamps to enforce cooldowns
  // key: `${emailType}:${memorialId}` → ISO timestamp
  lastSent?: Record<string, string>;
}

// ── shouldSend ────────────────────────────────────────────────────────────────

/**
 * Returns true if the email should be sent.
 *
 * @param orgId      Organisation ID (null = use platform defaults only)
 * @param type       Email type
 * @param memorialId Required for batch/digest types to enforce per-memorial cooldown
 */
export async function shouldSend(
  orgId:      string | null,
  type:       EmailType,
  memorialId?: string,
): Promise<boolean> {
  // APPROVED_CONFIRMATION is permanently suppressed — never send
  if (type === 'APPROVED_CONFIRMATION') return false;

  // PAYMENT_FAILED is permanently forced on — an org must never be able
  // to opt out of the one email that warns them they're about to lose
  // the ability to create new memorials.
  if (type === 'PAYMENT_FAILED') return true;

  // FAMILY_ACCESS_GRANTED is permanently forced on — see the comment on
  // its PLATFORM_DEFAULTS entry above. There is no other path for the
  // family to receive their access link/QR if this were suppressible.
  if (type === 'FAMILY_ACCESS_GRANTED') return true;

  const platformDefault = PLATFORM_DEFAULTS[type] ?? true;

  if (!orgId) return platformDefault;

  // Load org prefs
  let prefs: NotificationPrefs = {};
  try {
    const org = await prisma.organisation.findUnique({
      where:  { id: orgId },
      select: { notificationPrefs: true },
    });
    if (org?.notificationPrefs) {
      prefs = org.notificationPrefs as NotificationPrefs;
    }
  } catch (error) {
    // Was a bare swallow — a real DB outage here silently fell back to
    // platform defaults with zero trace in logs. Fallback behaviour is
    // unchanged (still returns platformDefault); this only makes the
    // failure visible.
    logError('checkNotificationAllowed: failed to load org notification prefs', error);
    return platformDefault;
  }

  // Org override
  const orgOverride = prefs.overrides?.[type];
  const allowed     = orgOverride !== undefined ? orgOverride : platformDefault;
  if (!allowed) return false;

  // Batch cooldown check
  const cooldown = BATCH_COOLDOWN_MS[type];
  if (cooldown && memorialId) {
    const key      = `${type}:${memorialId}`;
    const lastSent = prefs.lastSent?.[key];
    if (lastSent) {
      const elapsed = Date.now() - new Date(lastSent).getTime();
      if (elapsed < cooldown) return false;
    }
  }

  return true;
}

/**
 * Record that a batch email was just sent.
 * Updates Organisation.notificationPrefs.lastSent in-place.
 * Non-blocking — fire-and-forget.
 */
export function recordBatchSent(
  orgId:      string,
  type:       EmailType,
  memorialId: string,
): void {
  const key = `${type}:${memorialId}`;
  prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { notificationPrefs: true },
  }).then(org => {
    const prefs = (org?.notificationPrefs ?? {}) as NotificationPrefs;
    const updated: NotificationPrefs = {
      ...prefs,
      lastSent: {
        ...(prefs.lastSent ?? {}),
        [key]: new Date().toISOString(),
      },
    };
    return prisma.organisation.update({
      where: { id: orgId },
      data:  { notificationPrefs: updated as unknown as Prisma.InputJsonValue },
    });
  }).catch(err => {
    console.error('[email/policy] recordBatchSent failed:', err);
  });
}

/**
 * Convenience: load orgId for a memorial (cached in caller where possible).
 */
export async function getOrgIdForMemorial(memorialId: string): Promise<string | null> {
  try {
    const m = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { organisationId: true },
    });
    return m?.organisationId ?? null;
  } catch (error) {
    // Was a bare swallow — null is also the legitimate return value for
    // "this memorial genuinely has no org", so a DB failure here was
    // previously indistinguishable from that normal case anywhere
    // downstream. Return value unchanged; only logging added.
    logError('getOrgIdForMemorial: failed to load memorial', error);
    return null;
  }
}
