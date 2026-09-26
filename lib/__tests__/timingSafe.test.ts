import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { timingSafeStringEqual, isValidCronSecret } from '@/lib/timingSafe';

describe('timingSafeStringEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeStringEqual('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeStringEqual('abc123', 'abc124')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(() => timingSafeStringEqual('short', 'a-lot-longer')).not.toThrow();
    expect(timingSafeStringEqual('short', 'a-lot-longer')).toBe(false);
  });

  it('returns false, not throws, when either value is null, undefined, or empty', () => {
    expect(timingSafeStringEqual(null, 'abc123')).toBe(false);
    expect(timingSafeStringEqual('abc123', undefined)).toBe(false);
    expect(timingSafeStringEqual('', 'abc123')).toBe(false);
    expect(timingSafeStringEqual(null, null)).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(timingSafeStringEqual('AbC123', 'abc123')).toBe(false);
  });
});

describe('isValidCronSecret', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'a-long-random-test-secret-value';
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('accepts the exact configured secret', () => {
    expect(isValidCronSecret('a-long-random-test-secret-value')).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(isValidCronSecret('a-long-random-test-secret-wrong')).toBe(false);
  });

  it('rejects an empty or missing provided value', () => {
    expect(isValidCronSecret('')).toBe(false);
    expect(isValidCronSecret(null)).toBe(false);
    expect(isValidCronSecret(undefined)).toBe(false);
  });

  it('rejects every request when CRON_SECRET itself is unset, rather than treating unset as a wildcard', () => {
    delete process.env.CRON_SECRET;
    expect(isValidCronSecret('anything-at-all')).toBe(false);
    expect(isValidCronSecret('')).toBe(false);
  });
});
