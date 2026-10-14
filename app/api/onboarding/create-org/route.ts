/**
 * POST /api/onboarding/create-org
 *
 * Part D — Step 1: "Name your organisation."
 *
 * CRITICAL — do not import getOrgForUser / getOrgIdForUser (lib/tenant.ts)
 * or call them anywhere in this file, directly or indirectly.
 *
 * Those helpers auto-create a personal Organisation ("My Funeral Home")
 * for any Clerk userId with zero OrgMember rows, the INSTANT they are
 * first called — and getOrgContextForUser/getOrgForUser always resolve
 * to the earliest-created membership. If anything on this route's path
 * called them before this route creates the user's real, named org,
 * the user would be silently handed a throwaway personal org that wins
 * forever over the org they're in the middle of naming.
 *
 * This route works with prisma.organisation / prisma.orgMember directly,
 * the same pattern already used (and load-bearing) in
 * app/api/org/invite/[token]/accept/route.ts. Preserve it.
 *
 * Body: { name: string, caseTypes?: ('HUMAN' | 'PET')[] }
 * Returns: { success: true, organisationId: string, slug: string }
 *
 * caseTypes drives which case-management feature(s) the new org gets
 * from day one — featureCaseLite for HUMAN, featurePetAftercare for PET.
 * This is deliberately a one-time choice made at signup, not a later
 * self-serve settings toggle: which kind of business an org is doesn't
 * change day to day, and pet aftercare is still a hand-rolled-out
 * feature for a handful of prospects, so gating it here (rather than a
 * switch any staff member could flip) keeps it from spreading beyond
 * organisations that were actually meant to have it. Defaults to HUMAN
 * only if omitted, preserving existing behaviour for the current sign-up
 * flow/tests that don't yet send this field.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { logError }                   from '@/lib/errors';
import { checkRateLimit }             from '@/lib/rateLimit';
import { CURRENT_TERMS_VERSION }      from '@/lib/legal';
import { computeTrialEndsAt }         from '@/lib/billing/trial';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    // Authenticated route, so bucket per-user rather than per-IP alone —
    // stops one compromised/scripted account from hammering this even
    // from a rotating/shared IP.
    const limited = await checkRateLimit(req, `onboarding-create-org:${userId}`, { max: 5, windowMs: 60 * 1000 });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';

    // ADDED — Terms/Privacy consent, enforced server-side, not just a
    // disabled-until-checked button in the UI. A raw API call bypassing
    // the frontend form must not be able to create an org without this;
    // the checkbox is a UX affordance, this check is the actual gate.
    if (body?.agreedToTerms !== true) {
      return NextResponse.json(
        { success: false, error: 'You must agree to the Terms of Service and Privacy Policy to continue.' },
        { status: 400 },
      );
    }

    const rawCaseTypes: unknown = body?.caseTypes;
    const caseTypes: ('HUMAN' | 'PET')[] =
      Array.isArray(rawCaseTypes) && rawCaseTypes.every(t => t === 'HUMAN' || t === 'PET') && rawCaseTypes.length > 0
        ? rawCaseTypes
        : ['HUMAN']; // preserve existing behaviour if the field is omitted

    if (!rawName || rawName.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Organisation name must be at least 2 characters' },
        { status: 400 },
      );
    }
    if (rawName.length > 120) {
      return NextResponse.json(
        { success: false, error: 'Organisation name is too long' },
        { status: 400 },
      );
    }

    // If this user already has ANY membership, do not create a second org.
    // This keeps the route idempotent — a user who double-submits, hits
    // back, or reloads mid-flow lands on their existing org instead of
    // accumulating duplicates. Direct prisma.orgMember read only, no
    // getOrgForUser call.
    const existing = await prisma.orgMember.findFirst({
      where:  { userId },
      select: { organisationId: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      const org = await prisma.organisation.findUnique({
        where:  { id: existing.organisationId },
        select: { id: true, slug: true },
      });
      if (org) {
        return NextResponse.json({ success: true, organisationId: org.id, slug: org.slug, alreadyExisted: true });
      }
    }

    const baseSlug = slugify(rawName);
    let slug = baseSlug;
    let attempt = 0;

    // Resolve slug collisions deterministically without a retry-loop
    // race — @unique on slug will still catch a true concurrent
    // collision, this just avoids the common case failing outright.
    while (await prisma.organisation.findUnique({ where: { slug }, select: { id: true } })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
      if (attempt > 20) {
        slug = `${baseSlug}-${userId.slice(-6).toLowerCase()}`;
        break;
      }
    }

    const org = await prisma.organisation.create({
      data: {
        clerkOrgId: `org_${userId}_${Date.now()}`,
        name:       rawName,
        slug,
        plan:       'STARTER',
        trialEndsAt: await computeTrialEndsAt(),
        featureCaseLite:     caseTypes.includes('HUMAN'),
        featurePetAftercare: caseTypes.includes('PET'),
        termsAcceptedAt:       new Date(),
        termsAcceptedVersion:  CURRENT_TERMS_VERSION,
        termsAcceptedByUserId: userId,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
      select: { id: true, slug: true },
    });

    return NextResponse.json({ success: true, organisationId: org.id, slug: org.slug });

  } catch (error) {
    logError('POST /api/onboarding/create-org', error);
    return NextResponse.json({ success: false, error: 'Failed to create organisation' }, { status: 500 });
  }
}
