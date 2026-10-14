import { describe, it, expect, vi } from 'vitest';

// usage.ts imports the shared prisma client at module load; the function under
// test only touches the `db` we pass in, so stub the module out.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { recordUsage } from '../usage';

function fakeDb(org: Record<string, unknown> | null, insertCount = 1) {
  const createMany = vi.fn().mockResolvedValue({ count: insertCount });
  const db = {
    organisation: { findUnique: vi.fn().mockResolvedValue(org) },
    usageEvent:   { createMany },
  };
  return { db: db as never, createMany };
}

const base = { organisationId: 'org1', type: 'MEMORIAL_CREATED' as const, memorialId: 'm1', memorialTitle: 'Jane Smith' };
const rates = { customBaseFeeCents: null, customMemorialFeeCents: null };

describe('recordUsage', () => {
  it('freezes the $199 price onto the event after the trial', async () => {
    const { db, createMany } = fakeDb({ ...rates, trialEndsAt: null });
    const r = await recordUsage(db, base);
    expect(r).toEqual({ recorded: true, unitPriceCents: 19900 });
    const row = createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({ organisationId: 'org1', memorialId: 'm1', memorialTitle: 'Jane Smith', unitPriceCents: 19900 });
  });

  it('uses a negotiated per-site rate', async () => {
    const { db } = fakeDb({ customBaseFeeCents: null, customMemorialFeeCents: 15000, trialEndsAt: null });
    expect((await recordUsage(db, base)).unitPriceCents).toBe(15000);
  });

  it('records at $0 during the free trial', async () => {
    const { db, createMany } = fakeDb({ ...rates, trialEndsAt: new Date(Date.now() + 86_400_000) });
    expect((await recordUsage(db, base)).unitPriceCents).toBe(0);
    expect(createMany.mock.calls[0][0].data[0].note).toMatch(/trial/i);
  });

  it('prices a backfilled event as of when it happened, not now', async () => {
    // trial ended yesterday, but the memorial was created inside the trial
    const { db } = fakeDb({ ...rates, trialEndsAt: new Date(Date.now() - 86_400_000) });
    const r = await recordUsage(db, { ...base, at: new Date(Date.now() - 10 * 86_400_000) });
    expect(r.unitPriceCents).toBe(0);
  });

  it('is idempotent: uses skipDuplicates and reports recorded=false on a repeat', async () => {
    const { db, createMany } = fakeDb({ ...rates, trialEndsAt: null }, 0);
    const r = await recordUsage(db, base);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(r.recorded).toBe(false);
  });

  it('records tribute videos at $0', async () => {
    const { db } = fakeDb({ ...rates, trialEndsAt: null });
    expect((await recordUsage(db, { ...base, type: 'TRIBUTE_VIDEO_RENDERED' })).unitPriceCents).toBe(0);
  });

  it('throws if the organisation does not exist (never silently unbilled)', async () => {
    const { db } = fakeDb(null);
    await expect(recordUsage(db, base)).rejects.toThrow(/not found/);
  });
});
