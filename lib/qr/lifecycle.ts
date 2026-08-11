// lib/qr/lifecycle.ts
//
// QR state machine — pure functions only, zero database calls.
//
// These functions compute effective state from stored data + current time,
// validate state transitions, and calculate unlock times.
//
// No development environment bypass in isValidTransition.
// All environments use identical validation — this is intentional so
// localhost testing catches the same errors as production.

import type { QRState } from '@/types/v2';
import { QR_STATES } from '@/types/v2';

// ── Effective state computation ───────────────────────────────────────────────

interface MemorialStateInput {
  qrState:        string;
  serviceStartAt: Date | null;
  unlockAt:       Date | null;
}

/**
 * Computes the effective QR state from stored state + current time.
 * Read-only — never mutates the database.
 *
 * Why this exists:
 *   The cron job runs every 5 minutes. If a family member scans the QR at
 *   14:01 and the cron last ran at 13:55, the DB may still show UNLOCK_PENDING
 *   even though unlockAt has passed. This function resolves that transparently
 *   without waiting for the next cron tick.
 */

// Re-export so route files can import validation + state machine from one place
    export function isValidQRState(s: string): s is QRState {
  return (QR_STATES as string[]).includes(s);
}

export function computeEffectiveState(
  memorial: MemorialStateInput,
  now: Date = new Date(),
): QRState {
  const stored = memorial.qrState as QRState;

  // Terminal states — always respected, no time override
  if (stored === 'PRIVATE' || stored === 'ARCHIVED') {
    return stored;
  }

  // Explicitly open — show memorial
  if (stored === 'MEMORIAL_OPEN') {
    return 'MEMORIAL_OPEN';
  }

  // UNLOCK_PENDING: advance to MEMORIAL_OPEN if unlockAt has passed
  if (stored === 'UNLOCK_PENDING') {
    if (memorial.unlockAt && memorial.unlockAt <= now) {
      return 'MEMORIAL_OPEN';
    }
    return 'UNLOCK_PENDING';
  }

  // SERVICE_ACTIVE: advance to MEMORIAL_OPEN if unlockAt has passed
  if (stored === 'SERVICE_ACTIVE') {
    if (memorial.unlockAt && memorial.unlockAt <= now) {
      return 'MEMORIAL_OPEN';
    }
    return 'SERVICE_ACTIVE';
  }

  // PRE_SERVICE: advance through states based on time
  if (stored === 'PRE_SERVICE') {
    if (!memorial.serviceStartAt) {
      return 'PRE_SERVICE';
    }
    if (memorial.serviceStartAt > now) {
      return 'PRE_SERVICE';
    }
    // Service has started
    if (memorial.unlockAt && memorial.unlockAt <= now) {
      return 'MEMORIAL_OPEN';
    }
    return 'SERVICE_ACTIVE';
  }

  // Fallback — unknown state defaults to open
  return 'MEMORIAL_OPEN';
}

// ── Auto-unlock cron query helper ─────────────────────────────────────────────

/**
 * Returns the Prisma WHERE clause for the cron job that auto-unlocks memorials.
 * Selects rows where qrState is UNLOCK_PENDING and unlockAt has passed.
 */
export function autoUnlockWhere() {
  return {
    qrState:  'UNLOCK_PENDING',
    unlockAt: { lte: new Date() },
  } as const;
}

// ── State transition validation ───────────────────────────────────────────────

const VALID_TRANSITIONS: Record<QRState, QRState[]> = {
  PRE_SERVICE:    ['SERVICE_ACTIVE', 'UNLOCK_PENDING', 'MEMORIAL_OPEN', 'PRIVATE'],
  SERVICE_ACTIVE: ['UNLOCK_PENDING', 'MEMORIAL_OPEN', 'PRIVATE'],
  UNLOCK_PENDING: ['MEMORIAL_OPEN', 'PRIVATE'],
  MEMORIAL_OPEN:  ['PRIVATE', 'ARCHIVED'],
  PRIVATE:        ['MEMORIAL_OPEN'],
  ARCHIVED:       [],  // Terminal — no further transitions
};

/**
 * Returns true if the transition from → to is allowed.
 * Same behaviour in all environments — no dev bypass.
 */
export function isValidTransition(from: QRState, to: QRState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Unlock time calculator ────────────────────────────────────────────────────

/**
 * Returns the datetime when a memorial should auto-unlock.
 * = serviceStartAt + defaultUnlockDelayHours
 */
export function calculateUnlockAt(
  serviceStartAt:    Date,
  defaultDelayHours: number = 24,
): Date {
  return new Date(serviceStartAt.getTime() + defaultDelayHours * 60 * 60 * 1000);
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function stateLabel(state: QRState): string {
  const labels: Record<QRState, string> = {
    PRE_SERVICE:    'Pre-service (Pamphlet)',
    SERVICE_ACTIVE: 'Service Active',
    UNLOCK_PENDING: 'Awaiting Unlock',
    MEMORIAL_OPEN:  'Memorial Open',
    PRIVATE:        'Private',
    ARCHIVED:       'Archived',
  };
  return labels[state] ?? state;
}

export function stateDescription(state: QRState): string {
  const descriptions: Record<QRState, string> = {
    PRE_SERVICE:    'QR shows service pamphlet with venue and time details',
    SERVICE_ACTIVE: 'QR shows service information',
    UNLOCK_PENDING: 'QR shows a countdown until the memorial opens',
    MEMORIAL_OPEN:  'QR shows the full memorial page',
    PRIVATE:        'QR shows a privacy notice — memorial is hidden',
    ARCHIVED:       'QR shows a read-only archived view',
  };
  return descriptions[state] ?? '';
}
