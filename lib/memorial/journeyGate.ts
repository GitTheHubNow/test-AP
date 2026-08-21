// lib/memorial/journeyGate.ts
//
// Pure functions — no database calls — that decide which memorial
// sections are locked for a funeral home based on how close the
// service is, and when the automated emails / auto-handover should fire.
//
// Single source of truth for this timing so the sidebar lock icons,
// the Memorial Journey tracker, and the cron jobs can't drift out of
// sync with each other — same principle as lib/qr/lifecycle.ts.
//
// Timing, all relative to Memorial.funeralDate:
//   - Collection: never locked. It's where the QR code itself is
//     generated and shared — staff need it reachable from day one to
//     actually get the memorial started.
//   - Photos / Tribute Video / Guest Book: locked until
//     UNLOCK_DAYS_BEFORE_SERVICE days before the service, unless
//     tributeUnlockOverride is set (one override covers all three —
//     they unlock together, e.g. when a family walks in with a USB
//     stick of photos ready to go).
//   - "Last chance to upload" family email: fires at the same
//     UNLOCK_DAYS_BEFORE_SERVICE mark.
//   - "Ready to review & publish" staff prompt: fires
//     PUBLISH_PROMPT_DAYS_BEFORE days before the service.
//   - Auto-handover initiation: fires AUTO_HANDOVER_DAYS_AFTER days
//     after the service.
//
// All three constants are deliberately in one place so they're easy
// to tune later (e.g. per-org configurable) without touching the
// jobs or UI that consume them.

export const UNLOCK_DAYS_BEFORE_SERVICE = 5;
export const PUBLISH_PROMPT_DAYS_BEFORE = 1;
export const AUTO_HANDOVER_DAYS_AFTER   = 7;

/** @deprecated use UNLOCK_DAYS_BEFORE_SERVICE — kept as an alias so existing imports keep working */
export const TRIBUTE_UNLOCK_DAYS_BEFORE = UNLOCK_DAYS_BEFORE_SERVICE;

export interface JourneyGateInput {
  funeralDate:            Date | null;
  tributeUnlockOverride?: boolean;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bMid.getTime() - aMid.getTime()) / msPerDay);
}

/**
 * Is the gated section (Photos / Tribute Video / Guest Book) unlocked
 * right now? True if: staff manually overrode it, or today is within
 * UNLOCK_DAYS_BEFORE_SERVICE of the service. False (locked) if there's
 * no funeral date yet — nothing to count down to, so it stays closed
 * until staff set one or override it.
 */
export function isSectionUnlocked(input: JourneyGateInput, now: Date = new Date()): boolean {
  if (input.tributeUnlockOverride) return true;
  if (!input.funeralDate) return false;

  const daysUntilService = daysBetween(now, input.funeralDate);
  return daysUntilService <= UNLOCK_DAYS_BEFORE_SERVICE;
}

/** @deprecated use isSectionUnlocked — kept as an alias so existing imports keep working */
export const isTributeUnlocked = isSectionUnlocked;

/**
 * How many days remain until the gated sections auto-unlock. Returns
 * null if already unlocked or there's no funeral date to count down to.
 */
export function daysUntilSectionUnlock(input: JourneyGateInput, now: Date = new Date()): number | null {
  if (isSectionUnlocked(input, now)) return null;
  if (!input.funeralDate) return null;

  const daysUntilService = daysBetween(now, input.funeralDate);
  const daysRemaining = daysUntilService - UNLOCK_DAYS_BEFORE_SERVICE;
  return daysRemaining > 0 ? daysRemaining : 0;
}

/** @deprecated use daysUntilSectionUnlock — kept as an alias so existing imports keep working */
export const daysUntilTributeUnlock = daysUntilSectionUnlock;

/**
 * Should the "last chance to upload photos" email fire today?
 * (Job-side callers additionally filter on a not-yet-sent flag —
 * this only answers the timing question.)
 */
export function isLastChanceEmailDue(funeralDate: Date, now: Date = new Date()): boolean {
  return daysBetween(now, funeralDate) <= UNLOCK_DAYS_BEFORE_SERVICE;
}

/**
 * Should the "ready to review & publish" staff prompt fire today?
 */
export function isPublishPromptDue(funeralDate: Date, now: Date = new Date()): boolean {
  return daysBetween(now, funeralDate) <= PUBLISH_PROMPT_DAYS_BEFORE;
}

/**
 * Should auto-handover initiate today?
 */
export function isAutoHandoverDue(funeralDate: Date, now: Date = new Date()): boolean {
  return daysBetween(funeralDate, now) >= AUTO_HANDOVER_DAYS_AFTER;
}
