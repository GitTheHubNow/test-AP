// lib/auth/getOrgForUser.ts
//
// Authorization helpers for V2 routes.
//
// getOrgIdForUser is RE-EXPORTED from lib/tenant (not re-implemented).
// dashboard-memorials-route.ts imports from '@/lib/tenant'.
// V2 routes import from '@/lib/auth/getOrgForUser'.
// Both resolve to the same function — one source of truth.
//
// To check: run grep -r "getOrgIdForUser" app/ lib/ to confirm all usages.

import { prisma } from '@/lib/prisma';

// Single source of truth — delegate to existing tenant module
export { getOrgIdForUser } from '@/lib/tenant';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgContext {
  organisationId:      string;
  role:                'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  plan:                'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  featureQrLifecycle:  boolean;
  featurePamphlet:     boolean;
  featureSlideshow:    boolean;
  featureProducts:     boolean;
  featureCaseLite:     boolean;
  featurePetAftercare: boolean;
  isWhiteLabelEnabled: boolean;
}

// ── Context helpers ───────────────────────────────────────────────────────────

/**
 * Returns full org context including role and Phase 17 feature flags.
 * Returns null if user has no org membership.
 * Uses orderBy: { createdAt: 'asc' } to be deterministic if user is
 * ever in multiple orgs.
 */
export async function getOrgContextForUser(userId: string): Promise<OrgContext | null> {
  const member = await prisma.orgMember.findFirst({
    where:   { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role:           true,
      organisationId: true,
      organisation: {
        select: {
          plan:                true,
          featureQrLifecycle:  true,
          featurePamphlet:     true,
          featureSlideshow:    true,
          featureProducts:     true,
          featureCaseLite:     true,
          featurePetAftercare: true,
          isWhiteLabelEnabled: true,
        },
      },
    },
  });

  if (!member) return null;

  return {
    organisationId:      member.organisationId,
    role:                member.role as OrgContext['role'],
    plan:                member.organisation.plan as OrgContext['plan'],
    featureQrLifecycle:  member.organisation.featureQrLifecycle,
    featurePamphlet:     member.organisation.featurePamphlet,
    featureSlideshow:    member.organisation.featureSlideshow,
    featureProducts:     member.organisation.featureProducts,
    featureCaseLite:     member.organisation.featureCaseLite,
    featurePetAftercare: member.organisation.featurePetAftercare,
    isWhiteLabelEnabled: member.organisation.isWhiteLabelEnabled,
  };
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

/**
 * Asserts user is a member of the given org.
 * Returns member role. Throws 403 if not a member.
 *
 * Uses compound unique key organisationId_userId, matching
 * @@unique([organisationId, userId]) on OrgMember in schema.
 */
export async function assertOrgMember(
  userId: string,
  organisationId: string,
): Promise<{ role: string }> {
  const member = await prisma.orgMember.findUnique({
    where: {
      organisationId_userId: { organisationId, userId },
    },
    select: { role: true },
  });

  if (!member) {
    throw Object.assign(
      new Error('Not a member of this organisation'),
      { status: 403 },
    );
  }
  return member;
}

/**
 * Asserts user has ADMIN or OWNER role.
 * Throws 403 for MEMBER or VIEWER.
 */
export async function assertOrgAdmin(
  userId: string,
  organisationId: string,
): Promise<void> {
  const member = await assertOrgMember(userId, organisationId);
  if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
    throw Object.assign(new Error('Admin access required'), { status: 403 });
  }
}

/**
 * Asserts userId can access a given memorial (read, edit, or delete).
 *
 * Rules:
 *   ownerId → always full access regardless of org
 *   VIEWER  → read only
 *   MEMBER  → read + edit own memorials within org
 *   ADMIN/OWNER → read + edit + delete all org memorials
 */
export async function assertMemorialAccess(
  memorialId: string,
  userId: string,
  action: 'read' | 'edit' | 'delete' = 'read',
): Promise<void> {
  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: { ownerId: true, organisationId: true },
  });

  if (!memorial) {
    throw Object.assign(new Error('Memorial not found'), { status: 404 });
  }

  // Direct owner always has full access
  if (memorial.ownerId === userId) return;

  if (memorial.organisationId) {
    const member = await prisma.orgMember.findUnique({
      where: {
        organisationId_userId: {
          organisationId: memorial.organisationId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!member) {
      throw Object.assign(new Error('Access denied'), { status: 403 });
    }

    if (action !== 'read' && member.role === 'VIEWER') {
      throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
    }

    if ((action === 'edit' || action === 'delete') && member.role === 'MEMBER') {
      // MEMBER cannot edit memorials they don't own
      // (ownerId check already passed above — so this is another user's memorial)
      throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
    }

    return;
  }

  throw Object.assign(new Error('Access denied'), { status: 403 });
}

/**
 * Asserts a V2 feature flag is enabled for the user's org.
 * Throws 403 if not enabled or user has no org.
 *
 * Note: solo users (no org) cannot use V2 features.
 * V2 feature flags are per-org only.
 */
export async function assertFeatureEnabled(
  userId: string,
  feature: 'qrLifecycle' | 'pamphlet' | 'slideshow' | 'products' | 'caseLite' | 'petAftercare',
): Promise<OrgContext> {
  const ctx = await getOrgContextForUser(userId);

  if (!ctx) {
    throw Object.assign(
      new Error('No organisation found'),
      { status: 403 },
    );
  }

  const map: Record<typeof feature, boolean> = {
    qrLifecycle:  ctx.featureQrLifecycle,
    pamphlet:     ctx.featurePamphlet,
    slideshow:    ctx.featureSlideshow,
    products:     ctx.featureProducts,
    caseLite:     ctx.featureCaseLite,
    petAftercare: ctx.featurePetAftercare,
  };

  if (!map[feature]) {
    throw Object.assign(
      new Error(`Feature '${feature}' is not enabled for your organisation`),
      { status: 403 },
    );
  }

  return ctx;
}
