/**
 * lib/tenant.ts
 *
 * Resolves the Organisation for the current authenticated user.
 * Every API route that needs org context calls getOrgForUser().
 *
 * A user with NO org membership is NOT given an org here any more. Orgs are
 * created only by POST /api/onboarding/create-org, after the user has accepted
 * the Terms. Previously this file auto-created a "My Funeral Home" org on first
 * call, which let a freshly signed-up user skip /onboarding entirely (and the
 * terms acceptance) by calling any org-scoped API directly.
 */

import { prisma }  from '@/lib/prisma';
import type { Organisation, OrgRole } from '@prisma/client';
import { NextResponse } from 'next/server';

// ── Types ────────────────────────────────────────────────────────────────────

export type OrgWithRole = Organisation & { role: OrgRole };

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve (or create) the Organisation for a Clerk userId.
 * Returns the org + the user's role within it.
 *
 * Call this at the top of any route that needs plan/org context:
 *   const org = await getOrgForUser(userId);
 */
// ── V2 auth helpers — re-exported so routes can import from either location ───
// Routes may import assertFeatureEnabled from '@/lib/tenant' or
// '@/lib/auth/getOrgForUser' — both resolve to the same function.
export {
  assertFeatureEnabled,
  assertMemorialAccess as assertMemorialAccessV2,
  getOrgContextForUser,
} from '@/lib/auth/getOrgForUser';
// ─────────────────────────────────────────────────────────────────────────────

export const ONBOARDING_REQUIRED = 'ONBOARDING_REQUIRED';

/**
 * Thrown when a signed-in user has no organisation yet. Carries status 403 so
 * generic handlers (handleAuthError) answer correctly; routes that have their
 * own catch should call orgErrorResponse(err) first.
 */
export function onboardingRequiredError(): Error {
  return Object.assign(
    new Error('Please finish setting up your organisation before continuing.'),
    { status: 403, code: ONBOARDING_REQUIRED },
  );
}

/** 403 JSON response if `err` is the onboarding-required error, otherwise null. */
export function orgErrorResponse(err: unknown): NextResponse | null {
  if (err && typeof err === 'object' && (err as { code?: unknown }).code === ONBOARDING_REQUIRED) {
    return NextResponse.json(
      {
        success: false,
        error: 'Please finish setting up your organisation before continuing.',
        code: ONBOARDING_REQUIRED,
      },
      { status: 403 },
    );
  }
  return null;
}

export async function getOrgForUser(userId: string): Promise<OrgWithRole> {
  const membership = await prisma.orgMember.findFirst({
    where:   { userId },
    include: { organisation: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!membership) throw onboardingRequiredError();

  return { ...membership.organisation, role: membership.role };
}

/**
 * Quick ID-only lookup — use when you only need orgId, not the full record.
 */
export async function getOrgIdForUser(userId: string): Promise<string> {
  const org = await getOrgForUser(userId);
  return org.id;
}

/**
 * Verify a userId belongs to an org and has at least the required role.
 * Returns null if not a member or insufficient role.
 *
 * Role hierarchy: OWNER > ADMIN > MEMBER > VIEWER
 */
export async function assertOrgRole(
  userId:   string,
  orgId:    string,
  minRole:  OrgRole
): Promise<OrgRole | null> {
  const hierarchy: Record<OrgRole, number> = {
    VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3,
  };

  const membership = await prisma.orgMember.findUnique({
    where: { organisationId_userId: { organisationId: orgId, userId } },
    select: { role: true },
  });

  if (!membership) return null;
  if (hierarchy[membership.role] < hierarchy[minRole]) return null;
  return membership.role;
}

/**
 * Verify a memorial belongs to the user's org.
 * Replaces the existing `memorial.ownerId === userId` pattern for org-scoped access.
 * Falls back to ownerId check for memorials not yet assigned to an org.
 */
export async function assertMemorialAccess(
  memorialId: string,
  userId:     string
): Promise<{ id: string; organisationId: string | null } | null> {
  let orgId: string;
  try {
    orgId = await getOrgIdForUser(userId);
  } catch (err) {
    if (orgErrorResponse(err)) return null; // no org yet → no access
    throw err;
  }

  const memorial = await prisma.memorial.findUnique({
    where: { id: memorialId },
    select: { id: true, ownerId: true, organisationId: true },
  });

  if (!memorial) return null;

  // Org-scoped: memorial belongs to the user's org
  if (memorial.organisationId && memorial.organisationId === orgId) {
    return { id: memorial.id, organisationId: memorial.organisationId };
  }

  // Legacy fallback: direct ownership (memorials created before orgs existed)
  if (!memorial.organisationId && memorial.ownerId === userId) {
    return { id: memorial.id, organisationId: null };
  }

  return null;
}
