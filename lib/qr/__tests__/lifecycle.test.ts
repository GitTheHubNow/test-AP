import { describe, it, expect } from 'vitest';
import {
  computeEffectiveState,
  isValidTransition,
  calculateUnlockAt,
  autoUnlockWhere,
  isValidQRState,
} from '@/lib/qr/lifecycle';

const NOW = new Date('2026-06-15T12:00:00Z');
const PAST = new Date('2026-06-15T10:00:00Z');
const FUTURE = new Date('2026-06-15T14:00:00Z');

describe('computeEffectiveState', () => {
  it('leaves terminal states alone regardless of timing fields', () => {
    expect(computeEffectiveState(
      { qrState: 'PRIVATE', serviceStartAt: PAST, unlockAt: PAST }, NOW,
    )).toBe('PRIVATE');

    expect(computeEffectiveState(
      { qrState: 'ARCHIVED', serviceStartAt: PAST, unlockAt: PAST }, NOW,
    )).toBe('ARCHIVED');
  });

  it('keeps PRE_SERVICE showing the pamphlet before the service starts', () => {
    expect(computeEffectiveState(
      { qrState: 'PRE_SERVICE', serviceStartAt: FUTURE, unlockAt: null }, NOW,
    )).toBe('PRE_SERVICE');
  });

  it('advances PRE_SERVICE to SERVICE_ACTIVE once the service has started but unlock time hasn\u2019t arrived', () => {
    expect(computeEffectiveState(
      { qrState: 'PRE_SERVICE', serviceStartAt: PAST, unlockAt: FUTURE }, NOW,
    )).toBe('SERVICE_ACTIVE');
  });

  it('advances PRE_SERVICE all the way to MEMORIAL_OPEN if both the service and the unlock delay have already passed', () => {
    expect(computeEffectiveState(
      { qrState: 'PRE_SERVICE', serviceStartAt: PAST, unlockAt: PAST }, NOW,
    )).toBe('MEMORIAL_OPEN');
  });

  it('treats a PRE_SERVICE memorial with no serviceStartAt set as still pre-service', () => {
    expect(computeEffectiveState(
      { qrState: 'PRE_SERVICE', serviceStartAt: null, unlockAt: null }, NOW,
    )).toBe('PRE_SERVICE');
  });

  it('advances UNLOCK_PENDING to MEMORIAL_OPEN once unlockAt has passed, and not before', () => {
    expect(computeEffectiveState(
      { qrState: 'UNLOCK_PENDING', serviceStartAt: PAST, unlockAt: FUTURE }, NOW,
    )).toBe('UNLOCK_PENDING');

    expect(computeEffectiveState(
      { qrState: 'UNLOCK_PENDING', serviceStartAt: PAST, unlockAt: PAST }, NOW,
    )).toBe('MEMORIAL_OPEN');
  });

  it('treats unlockAt exactly equal to now as "passed" (uses <=, not <)', () => {
    expect(computeEffectiveState(
      { qrState: 'UNLOCK_PENDING', serviceStartAt: PAST, unlockAt: NOW }, NOW,
    )).toBe('MEMORIAL_OPEN');
  });

  it('never regresses MEMORIAL_OPEN back to an earlier state', () => {
    expect(computeEffectiveState(
      { qrState: 'MEMORIAL_OPEN', serviceStartAt: FUTURE, unlockAt: FUTURE }, NOW,
    )).toBe('MEMORIAL_OPEN');
  });
});

describe('isValidTransition', () => {
  it('allows the documented forward path from PRE_SERVICE through to MEMORIAL_OPEN', () => {
    expect(isValidTransition('PRE_SERVICE', 'SERVICE_ACTIVE')).toBe(true);
    expect(isValidTransition('SERVICE_ACTIVE', 'UNLOCK_PENDING')).toBe(true);
    expect(isValidTransition('UNLOCK_PENDING', 'MEMORIAL_OPEN')).toBe(true);
  });

  it('allows an Operator to move a memorial to PRIVATE from any non-terminal state', () => {
    expect(isValidTransition('PRE_SERVICE', 'PRIVATE')).toBe(true);
    expect(isValidTransition('SERVICE_ACTIVE', 'PRIVATE')).toBe(true);
    expect(isValidTransition('UNLOCK_PENDING', 'PRIVATE')).toBe(true);
    expect(isValidTransition('MEMORIAL_OPEN', 'PRIVATE')).toBe(true);
  });

  it('allows PRIVATE to be reopened back to MEMORIAL_OPEN, and nowhere else', () => {
    expect(isValidTransition('PRIVATE', 'MEMORIAL_OPEN')).toBe(true);
    expect(isValidTransition('PRIVATE', 'ARCHIVED')).toBe(false);
    expect(isValidTransition('PRIVATE', 'PRE_SERVICE')).toBe(false);
  });

  it('treats ARCHIVED as truly terminal — no transition out, ever', () => {
    expect(isValidTransition('ARCHIVED', 'MEMORIAL_OPEN')).toBe(false);
    expect(isValidTransition('ARCHIVED', 'PRIVATE')).toBe(false);
  });

  it('rejects skipping backwards, e.g. MEMORIAL_OPEN back to PRE_SERVICE', () => {
    expect(isValidTransition('MEMORIAL_OPEN', 'PRE_SERVICE')).toBe(false);
    expect(isValidTransition('SERVICE_ACTIVE', 'PRE_SERVICE')).toBe(false);
  });
});

describe('calculateUnlockAt', () => {
  it('defaults to a 24 hour delay after the service start time', () => {
    const start = new Date('2026-06-15T10:00:00Z');
    const unlock = calculateUnlockAt(start);
    expect(unlock.toISOString()).toBe('2026-06-16T10:00:00.000Z');
  });

  it('respects a custom delay in hours', () => {
    const start = new Date('2026-06-15T10:00:00Z');
    const unlock = calculateUnlockAt(start, 2);
    expect(unlock.toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });

  it('supports a zero-hour delay for immediate unlock', () => {
    const start = new Date('2026-06-15T10:00:00Z');
    const unlock = calculateUnlockAt(start, 0);
    expect(unlock.getTime()).toBe(start.getTime());
  });
});

describe('autoUnlockWhere', () => {
  it('always targets UNLOCK_PENDING with a time-in-the-past filter', () => {
    const clause = autoUnlockWhere();
    expect(clause.qrState).toBe('UNLOCK_PENDING');
    expect(clause.unlockAt.lte).toBeInstanceOf(Date);
    expect(Math.abs(clause.unlockAt.lte.getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe('isValidQRState', () => {
  it('accepts every real state and rejects garbage input', () => {
    expect(isValidQRState('MEMORIAL_OPEN')).toBe(true);
    expect(isValidQRState('PRIVATE')).toBe(true);
    expect(isValidQRState('made-up-state')).toBe(false);
    expect(isValidQRState('')).toBe(false);
  });
});
