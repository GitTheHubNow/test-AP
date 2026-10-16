import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  stage: 'LIVE' as string,
  created: [] as { kind: string; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => null, hashIp: () => 'iphash' }));
vi.mock('@/lib/audit', () => ({
  createAuditEvent: async () => {},
  AuditAction: { CREATE: 'C' }, ActorRole: { PUBLIC: 'P' },
  EntityType: { GUEST_BOOK_ENTRY: 'G', MEMORY: 'M' }, ReasonCode: { CREATION: 'C' },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    memorial: { findFirst: async () => ({ id: 'm1', status: 'ACTIVE', workflowStage: m.stage }) },
    guestBookEntry: { create: async ({ data }: { data: Record<string, unknown> }) => { m.created.push({ kind: 'guestbook', data }); return { id: 'e1', status: data.status, createdAt: new Date() }; } },
    memory:         { create: async ({ data }: { data: Record<string, unknown> }) => { m.created.push({ kind: 'memory', data });    return { id: 'e2', status: data.status, createdAt: new Date() }; } },
  },
}));

import { initialPublicStatus } from '../moderation';
import { POST as guestbookPOST } from '../../app/api/public/memorial/[token]/guest-book/route';
import { POST as memoryPOST } from '../../app/api/public/memorial/[token]/memory/route';

const post = (fn: typeof guestbookPOST, body: unknown) => fn(
  new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never,
  { params: Promise.resolve({ token: 'slug' }) },
);

describe('initialPublicStatus', () => {
  it('holds by default and publishes immediately only once handed over', () => {
    expect(initialPublicStatus('LIVE')).toBe('PENDING');
    expect(initialPublicStatus('DRAFT')).toBe('PENDING');
    expect(initialPublicStatus(null)).toBe('PENDING');
    expect(initialPublicStatus(undefined)).toBe('PENDING');
    expect(initialPublicStatus('HANDED_OVER')).toBe('APPROVED');
  });
});

describe('public guest-book submissions', () => {
  beforeEach(() => { m.stage = 'LIVE'; m.created = []; });

  it('are HELD for review on a normal memorial (was: published instantly)', async () => {
    const r = await post(guestbookPOST, { message: 'With love', authorName: 'Sam' });
    expect(r.status).toBe(200);
    expect(m.created[0].data.status).toBe('PENDING');
    expect((await r.json()).data.entry.status).toBe('PENDING');
  });

  it('abusive text does not go live — it is held like everything else', async () => {
    await post(guestbookPOST, { message: 'something vile' });
    expect(m.created[0].data.status).toBe('PENDING');
  });

  it('publish immediately on a HANDED-OVER memorial (no staff left to approve; family can hide)', async () => {
    m.stage = 'HANDED_OVER';
    await post(guestbookPOST, { message: 'Thinking of you' });
    expect(m.created[0].data.status).toBe('APPROVED');
  });

  it('still rejects an empty message', async () => {
    expect((await post(guestbookPOST, { message: '   ' })).status).toBe(400);
    expect(m.created).toHaveLength(0);
  });
});

describe('public memory submissions follow the same rule', () => {
  beforeEach(() => { m.stage = 'LIVE'; m.created = []; });

  it('held on a normal memorial, published on a handed-over one', async () => {
    await post(memoryPOST, { message: 'A story' });
    expect(m.created[0].data.status).toBe('PENDING');
    m.stage = 'HANDED_OVER';
    await post(memoryPOST, { message: 'Another story' });
    expect(m.created[1].data.status).toBe('APPROVED');
  });
});
