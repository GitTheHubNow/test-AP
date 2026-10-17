import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';
import { createMemorial } from '@/lib/memorial/createMemorial';
import { entitlementError } from '@/lib/entitlement';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * POST /api/memorial
 *
 * Creates a memorial shell with:
 * - All new service + family contact fields (Phase 14)
 * - Auto-generated uploadLinkToken for /upload/[token]
 * - Auto-configured MemorialHandover if familyContactEmail provided
 * - Auto-created MemorialSettings
 * - Auto-created Entitlement (FREE tier)
 *
 * ✅ Phase 14
 * ✅ SaaS launch: plan enforcement added
 *
 * Creation logic now lives in lib/memorial/createMemorial.ts so it can be
 * shared with CSV bulk auto-create (app/api/org/cases/csv-import/route.ts)
 * without duplicating this transaction. This route's request/response
 * shape is unchanged — pure delegation.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  // Per-user cap on creation attempts: stops a scripted sign-up from spraying
  // memorials (each one is a public page + a handover record).
  const limited = await checkRateLimit(request, `memorial-create:${userId}`, {
    max: 30, windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  let body: {
    firstName:          string;
    lastName:           string;
    preferredName?:     string;
    dateOfBirth?:       string;
    dateOfDeath?:       string;
    placeOfPassing?:    string;
    funeralDate?:       string;
    serviceType?:       string;
    serviceTime?:       string;
    venueName?:         string;
    venueAddress?:      string;
    familyContactName?:  string;
    familyContactEmail?: string;
    familyContactPhone?: string;
    isAboriginal?:           boolean;
    isTorresStraitIslander?: boolean;
    isSouthSeaIslander?:     boolean;
    isMaori?:                boolean;
    nominatedEmail?: string;
    sendAfterDays?:  number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || typeof body.firstName !== 'string' || !body.firstName.trim()) {
    return NextResponse.json({ success: false, error: 'firstName is required' }, { status: 400 });
  }
  if (typeof body.lastName !== 'string' || !body.lastName.trim()) {
    return NextResponse.json({ success: false, error: 'lastName is required' }, { status: 400 });
  }

  // Everything below touches the DB. Without this try/catch, any throw
  // (DB unreachable, Prisma engine missing, slug lookup failing…) became
  // Next's HTML 500 page, which the client then failed to parse as JSON
  // and showed as "Unexpected token '<'". Always answer in JSON, and log
  // the real cause so it shows up in Vercel's function logs.
  let result: Awaited<ReturnType<typeof createMemorial>>;
  try {
    const orgId = await getOrgIdForUser(userId);
    result = await createMemorial({
      ...body, ownerId: userId, organisationId: orgId,
      dedupeWindowMs: 15_000, // double-click / retry guard
    });
  } catch (err) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[POST /api/memorial] unhandled error:', err);
    return NextResponse.json(
      { success: false, error: 'Could not create the memorial. Please try again.' },
      { status: 500 },
    );
  }

  if (!result.ok) {
    if (result.kind === 'server_error') {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    if (result.kind === 'validation') {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    // plan_limit: suspended account or free-trial cap
    if (result.code === 'TRIAL_LIMIT_REACHED') {
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: 403 },
      );
    }
    return entitlementError(result.error);
  }

  return NextResponse.json({ success: true, data: { memorial: result.memorial } }, { status: 201 });
}
