import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  status: 'PENDING' as string,
  memorialUpdates: [] as unknown[],
  userId: 'user_family_1',
  emails: [{ emailAddress: 'f@x.com', verification: { status: 'verified' } }] as { emailAddress: string; verification?: { status?: string } | null }[],
  clerkFails: false,
  claimed: 0,
}));
const tick = () => new Promise<void>((r) => setImmediate(r));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({
    users: { getUser: async () => { if (state.clerkFails) throw new Error('clerk down'); return { emailAddresses: state.emails }; } },
  }),
}));
vi.mock('@/lib/audit', () => ({
  AuditAction: { HANDOVER_COMPLETED: 'x' }, ActorRole: { FAMILY: 'FAMILY' }, EntityType: { HANDOVER: 'H' }, ReasonCode: { HANDOVER: 'H' },
}));
vi.mock('@/lib/qr', () => ({ ensurePublicToken: async () => 'pub' }));
vi.mock('@/lib/familyAccess', () => ({ grantFamilyAccess: async () => ({ ok: true }) }));
vi.mock('@/lib/email/send', () => ({ sendHandoverAcceptedToFH: async () => {}, sendHandoverAcceptedToFamily: async () => {} }));
vi.mock('@prisma/client', () => ({ HandoverStatus: { PENDING: 'PENDING', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' } }));

vi.mock('@/lib/prisma', () => {
  const handoverRow = () => ({
    id: 'h1', status: state.status, memorialId: 'm1', previousOwnerId: 'user_fh', familyContactName: 'Fam', familyContactEmail: 'f@x.com',
    acceptTokenExpiresAt: null, memorial: { id: 'm1', ownerId: 'user_fh', title: 'T', slug: 's', publicToken: 'p' },
  });
  const tx = {
    memorialHandover: {
      // Atomic compare-and-set, like a real conditional UPDATE: only one caller can flip PENDING → COMPLETED.
      async updateMany({ where }: { where: { status: { notIn: string[] } } }) {
        await tick();
        if (where.status.notIn.includes(state.status)) return { count: 0 };
        state.status = 'COMPLETED';
        state.claimed++;
        return { count: 1 };
      },
      // Unconditional write — what the original, racy code called.
      async update() { await tick(); state.status = 'COMPLETED'; return {}; },
    },
    memorial: { async update(a: unknown) { await tick(); state.memorialUpdates.push(a); return {}; } },
    auditEvent: { async create() { await tick(); return {}; } },
  };
  return {
    prisma: {
      memorialHandover: { async findUnique() { await tick(); return handoverRow(); } },
      organisation: { async findFirst() { return null; } },
      async $transaction(cb: (t: typeof tx) => Promise<unknown>) { return cb(tx); },
    },
  };
});

import { POST } from '../../app/api/handover/accept/[token]/route';

const call = () => POST({} as never, { params: Promise.resolve({ token: 'tok' }) });

describe('handover accept — double submit', () => {
  beforeEach(() => { state.status = 'PENDING'; state.memorialUpdates = []; state.claimed = 0; });

  it('exactly one of two simultaneous accepts transfers ownership (was: both)', async () => {
    const [a, b] = await Promise.all([call(), call()]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([200, 409]);
    expect(state.memorialUpdates).toHaveLength(1);
  });

  it('a normal single accept still succeeds', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(state.memorialUpdates).toHaveLength(1);
  });

  it('a later accept of an already-completed handover is a 409', async () => {
    await call();
    expect((await call()).status).toBe(409);
    expect(state.memorialUpdates).toHaveLength(1);
  });
});


describe('handover accept — the link alone is not enough (email must match)', () => {
  beforeEach(() => {
    state.status = 'PENDING'; state.memorialUpdates = []; state.claimed = 0; state.clerkFails = false;
    state.emails = [{ emailAddress: 'f@x.com', verification: { status: 'verified' } }];
  });

  it('a signed-in stranger holding the link is REFUSED and ownership does not move (was: they became owner)', async () => {
    state.emails = [{ emailAddress: 'stranger@evil.com', verification: { status: 'verified' } }];
    const r = await call();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('EMAIL_MISMATCH');
    expect(state.memorialUpdates).toHaveLength(0);
    expect(state.claimed).toBe(0);
    expect(state.status).toBe('PENDING'); // the real family can still accept afterwards
  });

  it('the refusal masks the address instead of revealing it', async () => {
    state.emails = [{ emailAddress: 'stranger@evil.com', verification: { status: 'verified' } }];
    const body = await (await call()).json();
    expect(body.error).toContain('f***@x.com');
    expect(body.error).not.toContain('f@x.com');
  });

  it('an UNVERIFIED address that matches is refused (anyone can type an address they don\'t own)', async () => {
    state.emails = [{ emailAddress: 'f@x.com', verification: { status: 'unverified' } }];
    expect((await call()).status).toBe(403);
    expect(state.memorialUpdates).toHaveLength(0);
  });

  it('matching is case-insensitive and ignores surrounding whitespace', async () => {
    state.emails = [{ emailAddress: '  F@X.com ', verification: { status: 'verified' } }];
    expect((await call()).status).toBe(200);
  });

  it('works when the family\'s account has several addresses and ONE matches', async () => {
    state.emails = [
      { emailAddress: 'work@co.com', verification: { status: 'verified' } },
      { emailAddress: 'f@x.com', verification: { status: 'verified' } },
    ];
    expect((await call()).status).toBe(200);
  });

  it('fails CLOSED with a 503 if Clerk cannot be reached', async () => {
    state.clerkFails = true;
    const r = await call();
    expect(r.status).toBe(503);
    expect(state.memorialUpdates).toHaveLength(0);
  });

  it('the legitimate family member still accepts normally', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(state.memorialUpdates).toHaveLength(1);
  });
});
