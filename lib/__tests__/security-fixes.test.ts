import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  member: null as null | { role: string; organisation: Record<string, unknown> },
  isAdmin: false,
  orgCreateCalls: 0,
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock('@/lib/auth/platformAdmin', () => ({ isPlatformAdmin: () => h.isAdmin, assertPlatformAdmin: () => {} }));
vi.mock('@/lib/systemHealth', () => ({ runSystemHealthCheck: async () => ({ status: 'HEALTHY' }) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    orgMember: { findFirst: async () => h.member },
    organisation: { create: async () => { h.orgCreateCalls++; return {}; } },
    memorial: { findUnique: async () => ({ sealed: false }), update: async () => ({}) },
    auditEvent: { create: async () => ({}) },
  },
}));
vi.mock('@/lib/familyAccess', () => ({
  assertFamilyAccess: async () => ({ handoverId: 'h' }),
  FamilyAccessError: class extends Error { status = 401; },
}));
vi.mock('@/lib/storage-server', () => ({ saveUploadedFile: async () => 'key' }));
vi.mock('@/lib/file-validation', () => ({ verifyFileContent: () => ({ valid: true }) }));
vi.mock('@/lib/audit', () => ({
  AuditAction: { UPDATE: 'U' }, ActorRole: { FAMILY: 'F' }, EntityType: { MEMORIAL: 'M' }, ReasonCode: { FAMILY_SELF_SERVICE: 'F' },
}));

import { withBillingOrg } from '../billing/routeHelpers';
import { GET as healthGET } from '../../app/api/health/route';
import { PATCH as detailsPATCH } from '../../app/api/family-access/[memorialId]/details/route';

const ok = async () => new Response('{}', { status: 200 }) as never;

describe('billing routes never create an organisation as a side effect', () => {
  beforeEach(() => { h.userId = 'user_1'; h.member = null; h.orgCreateCalls = 0; });

  it('a signed-in user with no org gets 404 — and no org is created', async () => {
    const r = await withBillingOrg('t', ok);
    expect(r.status).toBe(404);
    expect(h.orgCreateCalls).toBe(0);
  });
  it('signed-out → 401', async () => {
    h.userId = null;
    expect((await withBillingOrg('t', ok)).status).toBe(401);
  });
  it('a plain MEMBER is refused for owner/admin-only data (403) but allowed where anyMember is set', async () => {
    h.member = { role: 'MEMBER', organisation: { id: 'o1' } };
    expect((await withBillingOrg('t', ok)).status).toBe(403);
    expect((await withBillingOrg('t', ok, { anyMember: true })).status).toBe(200);
  });
  it('OWNER and ADMIN are allowed', async () => {
    for (const role of ['OWNER', 'ADMIN']) {
      h.member = { role, organisation: { id: 'o1' } };
      expect((await withBillingOrg('t', ok)).status).toBe(200);
    }
  });
});

describe('/api/health is platform-admin only', () => {
  it('signed-out 401, ordinary user 403, admin 200', async () => {
    h.userId = null;
    expect((await healthGET({} as never)).status).toBe(401);
    h.userId = 'user_1'; h.isAdmin = false;
    expect((await healthGET({} as never)).status).toBe(403);
    h.isAdmin = true;
    expect((await healthGET({} as never)).status).toBe(200);
  });
});

describe('family details validation (was: 500 / unbounded)', () => {
  const patch = (body: unknown) => detailsPATCH(
    new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ memorialId: 'm1' }) },
  );

  it('rejects an invalid date with 400 instead of crashing', async () => {
    expect((await patch({ birthDate: 'not-a-date' })).status).toBe(400);
    expect((await patch({ deathDate: '31/31/2020' })).status).toBe(400);
  });
  it('rejects an oversized description', async () => {
    expect((await patch({ description: 'x'.repeat(10_001) })).status).toBe(400);
  });
  it('rejects non-string field types', async () => {
    expect((await patch({ birthDate: 12345 })).status).toBe(400);
  });
  it('accepts valid input, and "" clears a date', async () => {
    expect((await patch({ birthDate: '1950-03-04', description: 'Loved gardening.' })).status).toBe(200);
    expect((await patch({ deathDate: '' })).status).toBe(200);
  });
  it('rejects malformed JSON with 400', async () => {
    const r = await detailsPATCH(
      new Request('http://x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{bad' }) as never,
      { params: Promise.resolve({ memorialId: 'm1' }) },
    );
    expect(r.status).toBe(400);
  });
});
