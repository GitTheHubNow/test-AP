import { describe, it, expect, vi, beforeEach } from 'vitest';

const w = vi.hoisted(() => ({
  memorial: null as null | { ownerId: string; organisationId: string | null; workflowStage: string },
  handover: null as null | { familyClerkUserId: string | null },
  members: {} as Record<string, string>, // userId -> role
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }), currentUser: async () => null, clerkClient: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    memorial:         { findUnique: async () => w.memorial },
    memorialHandover: { findUnique: async () => w.handover },
    orgMember: {
      findUnique: async ({ where }: { where: { organisationId_userId: { userId: string } } }) => {
        const role = w.members[where.organisationId_userId.userId];
        return role ? { role } : null;
      },
    },
  },
}));

import { assertMemorialAccess } from '../auth/getOrgForUser';

const allowed = async (userId: string, action: 'read' | 'edit' | 'delete' = 'read', opts = {}) => {
  try { await assertMemorialAccess('m1', userId, action, opts); return true; }
  catch (e) { if ((e as { status?: number }).status === 403) return false; throw e; }
};

const STAFF_CREATOR = 'user_creator';
const STAFF_ADMIN   = 'user_admin';
const STAFF_OWNERR  = 'user_orgowner';
const STAFF_MEMBER  = 'user_member';
const FAMILY        = 'user_family';
const STRANGER      = 'user_stranger';

beforeEach(() => {
  w.members = { [STAFF_CREATOR]: 'ADMIN', [STAFF_ADMIN]: 'ADMIN', [STAFF_OWNERR]: 'OWNER', [STAFF_MEMBER]: 'MEMBER' };
  w.memorial = { ownerId: STAFF_CREATOR, organisationId: 'org1', workflowStage: 'LIVE' };
  w.handover = null;
});

describe('BEFORE handover — behaviour unchanged', () => {
  it('creator, org admin and org owner have access; stranger does not', async () => {
    expect(await allowed(STAFF_CREATOR, 'delete')).toBe(true);
    expect(await allowed(STAFF_ADMIN, 'edit')).toBe(true);
    expect(await allowed(STAFF_OWNERR, 'delete')).toBe(true);
    expect(await allowed(STRANGER)).toBe(false);
  });
  it('MEMBER can read but not edit a colleague\'s memorial', async () => {
    expect(await allowed(STAFF_MEMBER, 'read')).toBe(true);
    expect(await allowed(STAFF_MEMBER, 'edit')).toBe(false);
  });
});

describe('AFTER a DIRECT handover (family has no Clerk account; ownerId is still staff)', () => {
  beforeEach(() => {
    w.memorial = { ownerId: STAFF_CREATOR, organisationId: 'org1', workflowStage: 'HANDED_OVER' };
    w.handover = { familyClerkUserId: null };
  });

  it('NO staff member retains access — including the staff creator who is still ownerId', async () => {
    for (const u of [STAFF_CREATOR, STAFF_ADMIN, STAFF_OWNERR, STAFF_MEMBER]) {
      for (const a of ['read', 'edit', 'delete'] as const) {
        expect(await allowed(u, a), `${u} ${a}`).toBe(false);
      }
    }
  });
  it('a stranger is still refused', async () => {
    expect(await allowed(STRANGER)).toBe(false);
  });
});

describe('AFTER a Clerk-ACCEPT handover (family account is the owner)', () => {
  beforeEach(() => {
    w.memorial = { ownerId: FAMILY, organisationId: 'org1', workflowStage: 'HANDED_OVER' };
    w.handover = { familyClerkUserId: FAMILY };
  });

  it('the family account has full access', async () => {
    for (const a of ['read', 'edit', 'delete'] as const) expect(await allowed(FAMILY, a)).toBe(true);
  });
  it('funeral-home staff of every role are refused', async () => {
    for (const u of [STAFF_CREATOR, STAFF_ADMIN, STAFF_OWNERR, STAFF_MEMBER]) {
      expect(await allowed(u, 'read'), u).toBe(false);
    }
  });
  it('still works if the handover row lost its familyClerkUserId (non-staff owner fallback)', async () => {
    w.handover = { familyClerkUserId: null };
    expect(await allowed(FAMILY, 'edit')).toBe(true);
    expect(await allowed(STAFF_ADMIN, 'read')).toBe(false);
  });
  it('still works if the handover row is missing entirely', async () => {
    w.handover = null;
    expect(await allowed(FAMILY, 'edit')).toBe(true);
    expect(await allowed(STAFF_CREATOR, 'read')).toBe(false);
  });
  it('a staff member who is also ownerId is NOT treated as family (fallback must not leak)', async () => {
    w.memorial = { ownerId: STAFF_CREATOR, organisationId: 'org1', workflowStage: 'HANDED_OVER' };
    w.handover = null;
    expect(await allowed(STAFF_CREATOR, 'read')).toBe(false);
  });
});

describe('allowAfterHandover carve-out (handover-management routes only)', () => {
  beforeEach(() => {
    w.memorial = { ownerId: STAFF_CREATOR, organisationId: 'org1', workflowStage: 'HANDED_OVER' };
    w.handover = { familyClerkUserId: null };
  });
  it('lets staff through using the NORMAL role rules', async () => {
    const o = { allowAfterHandover: true };
    expect(await allowed(STAFF_CREATOR, 'edit', o)).toBe(true);
    expect(await allowed(STAFF_ADMIN, 'edit', o)).toBe(true);
    expect(await allowed(STAFF_MEMBER, 'edit', o)).toBe(false); // role limits still apply
  });
  it('does not let a stranger through', async () => {
    expect(await allowed(STRANGER, 'read', { allowAfterHandover: true })).toBe(false);
  });
  it('is off by default', async () => {
    expect(await allowed(STAFF_ADMIN, 'edit')).toBe(false);
  });
});
