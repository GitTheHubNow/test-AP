import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the rate_limit_hits table. Every operation yields to
// the event loop first so concurrent callers genuinely interleave, the way
// separate serverless invocations hitting Postgres do.
const db = vi.hoisted(() => ({ rows: [] as { id: number; bucket: string; ipHash: string; createdAt: Date }[], seq: 0 }));
const tick = () => new Promise<void>((r) => setImmediate(r));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rateLimitHit: {
      async create({ data }: { data: { bucket: string; ipHash: string } }) {
        await tick();
        const row = { id: ++db.seq, ...data, createdAt: new Date() };
        db.rows.push(row);
        return { id: row.id, createdAt: row.createdAt };
      },
      async count({ where }: { where: { bucket: string; ipHash: string; createdAt: { gte: Date; lte?: Date }; NOT?: { createdAt: Date; id: { gt: number } } } }) {
        await tick();
        return db.rows.filter((r) =>
          r.bucket === where.bucket && r.ipHash === where.ipHash &&
          r.createdAt >= where.createdAt.gte && (!where.createdAt.lte || r.createdAt <= where.createdAt.lte) &&
          !(where.NOT && r.createdAt.getTime() === where.NOT.createdAt.getTime() && r.id > where.NOT.id.gt),
        ).length;
      },
      async delete({ where }: { where: { id: number } }) {
        await tick();
        db.rows = db.rows.filter((r) => r.id !== where.id);
        return {};
      },
    },
  },
}));

import { checkRateLimit } from '../rateLimit';

const req = (ip = '1.2.3.4') => ({ headers: new Headers({ 'x-forwarded-for': ip }) }) as never;
const opts = { max: 8, windowMs: 15 * 60 * 1000 };

describe('checkRateLimit under a parallel burst', () => {
  beforeEach(() => { db.rows = []; db.seq = 0; });

  it('admits EXACTLY `max` of 20 simultaneous requests (was: all 20)', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit(req(), 'family-access-verify', opts)));
    expect(results.filter((r) => r === null).length).toBe(8);
    expect(results.filter((r) => r?.status === 429).length).toBe(12);
  });

  it('holds for a much bigger burst too (200 requests, limit 8)', async () => {
    const results = await Promise.all(Array.from({ length: 200 }, () => checkRateLimit(req(), 'big', opts)));
    expect(results.filter((r) => r === null).length).toBe(8);
  });

  it('still admits normal sequential traffic up to the limit, then blocks', async () => {
    for (let i = 0; i < 8; i++) expect(await checkRateLimit(req(), 'b', opts)).toBeNull();
    const blocked = await checkRateLimit(req(), 'b', opts);
    expect(blocked?.status).toBe(429);
  });

  it('rejected attempts do not extend the lockout (their rows are removed)', async () => {
    for (let i = 0; i < 8; i++) await checkRateLimit(req(), 'b', opts);
    for (let i = 0; i < 5; i++) await checkRateLimit(req(), 'b', opts); // all rejected
    expect(db.rows.length).toBe(8);
  });

  it('limits are per IP and per bucket', async () => {
    for (let i = 0; i < 8; i++) await checkRateLimit(req('1.1.1.1'), 'b', opts);
    expect(await checkRateLimit(req('2.2.2.2'), 'b', opts)).toBeNull();
    expect(await checkRateLimit(req('1.1.1.1'), 'other', opts)).toBeNull();
  });
});
