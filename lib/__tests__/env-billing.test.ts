import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), getAppUrl: () => 'http://x' }));

import { isAutoSendEnabled } from '../billing/statements';

const VALID = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  CLERK_SECRET_KEY: 'sk_test_x',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_x',
  RESEND_API_KEY: 're_x',
  CRON_SECRET: 'c'.repeat(40),
  FAMILY_SESSION_SECRET: 'f'.repeat(40),
  NODE_ENV: 'test',
};

describe('billing env flags never stop the site booting', () => {
  const saved = { ...process.env };
  beforeEach(() => { vi.resetModules(); Object.assign(process.env, VALID); });
  afterEach(() => { process.env = { ...saved }; });

  const boot = async (extra: Record<string, string>) => {
    Object.assign(process.env, extra);
    const { getEnv } = await import('../env');
    return getEnv();
  };

  // The exact value that took production down.
  it('accepts BILLING_AUTO_SEND=FALSE', async () => {
    expect((await boot({ BILLING_AUTO_SEND: 'FALSE' })).BILLING_AUTO_SEND).toBe('false');
  });
  it('accepts TRUE / True / 1 as true', async () => {
    for (const v of ['TRUE', 'True', '1']) {
      vi.resetModules();
      expect((await boot({ BILLING_AUTO_SEND: v })).BILLING_AUTO_SEND).toBe('true');
    }
  });
  it('treats garbage or blank as false instead of crashing', async () => {
    for (const v of ['banana', '']) {
      vi.resetModules();
      expect((await boot({ BILLING_AUTO_SEND: v })).BILLING_AUTO_SEND).toBe('false');
    }
  });
  it('treats a blank BILLING_DUE_DAYS as unset, not 0', async () => {
    expect((await boot({ BILLING_DUE_DAYS: '' })).BILLING_DUE_DAYS).toBeUndefined();
  });
  it('still reads a real BILLING_DUE_DAYS', async () => {
    expect((await boot({ BILLING_DUE_DAYS: '21' })).BILLING_DUE_DAYS).toBe(21);
  });
});

describe('isAutoSendEnabled (used by the monthly cron)', () => {
  const orig = process.env.BILLING_AUTO_SEND;
  afterEach(() => { if (orig === undefined) delete process.env.BILLING_AUTO_SEND; else process.env.BILLING_AUTO_SEND = orig; });

  for (const [v, want] of [['true', true], ['TRUE', true], [' True ', true], ['1', true], ['yes', true],
                           ['false', false], ['FALSE', false], ['', false], ['banana', false]] as const) {
    it(`"${v}" → ${want}`, () => { process.env.BILLING_AUTO_SEND = v; expect(isAutoSendEnabled()).toBe(want); });
  }
  it('unset → false', () => { delete process.env.BILLING_AUTO_SEND; expect(isAutoSendEnabled()).toBe(false); });
});
