import { describe, it, expect } from 'vitest';
import { validateMemorialInput, isValidEmail } from '@/lib/memorial/validateInput';

const ok = { firstName: 'Jane', lastName: 'Doe' };
const NOW = new Date('2026-10-17T00:00:00Z');

describe('validateMemorialInput', () => {
  it('accepts the minimum input', () => {
    expect(validateMemorialInput(ok, NOW)).toBeNull();
  });
  it('requires string names', () => {
    expect(validateMemorialInput({ firstName: 5, lastName: 'x' }, NOW)).toMatch(/firstName/);
    expect(validateMemorialInput({ firstName: 'a', lastName: '  ' }, NOW)).toMatch(/lastName/);
  });
  it('limits lengths', () => {
    expect(validateMemorialInput({ ...ok, firstName: 'a'.repeat(101) }, NOW)).toMatch(/100/);
    expect(validateMemorialInput({ ...ok, venueAddress: 'a'.repeat(301) }, NOW)).toMatch(/300/);
  });
  it('rejects bad emails (family contact becomes a handover recipient)', () => {
    expect(validateMemorialInput({ ...ok, familyContactEmail: 'nope' }, NOW)).toMatch(/valid email/);
    expect(validateMemorialInput({ ...ok, familyContactEmail: 'a@b.co' }, NOW)).toBeNull();
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
  it('rejects unparseable and out-of-range dates instead of 500ing later', () => {
    expect(validateMemorialInput({ ...ok, dateOfDeath: 'garbage' }, NOW)).toMatch(/valid date/);
    expect(validateMemorialInput({ ...ok, dateOfDeath: '2030-01-01' }, NOW)).toMatch(/future/);
    expect(validateMemorialInput({ ...ok, dateOfBirth: '1700-01-01' }, NOW)).toMatch(/range/);
    expect(validateMemorialInput({ ...ok, dateOfBirth: '2000-01-01', dateOfDeath: '1990-01-01' }, NOW)).toMatch(/before/);
    expect(validateMemorialInput({ ...ok, funeralDate: '2040-01-01' }, NOW)).toMatch(/range/);
  });
  it('accepts a normal funeral booking', () => {
    expect(validateMemorialInput({
      ...ok, dateOfBirth: '1960-08-20', dateOfDeath: '2025-08-29',
      funeralDate: '2026-10-20', serviceTime: '2026-10-20T01:30:00Z', sendAfterDays: 7,
    }, NOW)).toBeNull();
  });
  it('validates sendAfterDays and flags', () => {
    expect(validateMemorialInput({ ...ok, sendAfterDays: -1 }, NOW)).toMatch(/sendAfterDays/);
    expect(validateMemorialInput({ ...ok, sendAfterDays: 1.5 }, NOW)).toMatch(/sendAfterDays/);
    expect(validateMemorialInput({ ...ok, isMaori: 'yes' }, NOW)).toMatch(/isMaori/);
  });
});
