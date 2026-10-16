import { describe, it, expect } from 'vitest';
import { hasMatchingVerifiedEmail, maskEmail, verifiedEmails } from '../handoverEmail';

const v = (e: string) => ({ emailAddress: e, verification: { status: 'verified' } });
const u = (e: string) => ({ emailAddress: e, verification: { status: 'unverified' } });

describe('hasMatchingVerifiedEmail', () => {
  it('matches case-insensitively and ignores whitespace', () => {
    expect(hasMatchingVerifiedEmail([v('Jane@Gmail.com')], ' jane@gmail.COM ')).toBe(true);
  });
  it('requires verification', () => {
    expect(hasMatchingVerifiedEmail([u('jane@gmail.com')], 'jane@gmail.com')).toBe(false);
    expect(hasMatchingVerifiedEmail([{ emailAddress: 'jane@gmail.com' }], 'jane@gmail.com')).toBe(false);
    expect(hasMatchingVerifiedEmail([{ emailAddress: 'jane@gmail.com', verification: null }], 'jane@gmail.com')).toBe(false);
  });
  it('does not treat plus-addressing or a different domain as a match', () => {
    expect(hasMatchingVerifiedEmail([v('jane@gmail.com')], 'jane+x@gmail.com')).toBe(false);
    expect(hasMatchingVerifiedEmail([v('jane@gmail.com')], 'jane@gmail.org')).toBe(false);
  });
  it('never matches an empty contact email, even against an empty address', () => {
    expect(hasMatchingVerifiedEmail([v('')], '')).toBe(false);
    expect(hasMatchingVerifiedEmail([v('jane@gmail.com')], '   ')).toBe(false);
  });
  it('no addresses → no match', () => {
    expect(hasMatchingVerifiedEmail([], 'jane@gmail.com')).toBe(false);
  });
});

describe('verifiedEmails', () => {
  it('keeps only verified, normalised', () => {
    expect(verifiedEmails([v('A@x.com'), u('b@x.com')])).toEqual(['a@x.com']);
  });
});

describe('maskEmail', () => {
  it('shows only the first letter and the domain', () => {
    expect(maskEmail('jane.smith@gmail.com')).toBe('j***@gmail.com');
  });
  it('is safe on malformed input', () => {
    expect(maskEmail('nope')).toBe('***');
    expect(maskEmail('@x.com')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});
