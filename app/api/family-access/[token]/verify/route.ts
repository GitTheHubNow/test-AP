// app/api/family-access/[token]/verify/route.ts
//
// Public — no Clerk auth. This is the entire authentication mechanism
// for family self-service access: prove you have the physical QR/link
// (the token in the URL) AND know the email address the funeral home
// has on file for this memorial's family contact.
//
// Deliberately at a top-level /api/family-access/* path, not nested
// under /api/memorial/* — proxy.ts's isProtectedRoute matches
// '/api/memorial(.*)' and would force this through Clerk's auth.protect()
// otherwise, exactly the trap the existing /api/handover/accept/[token]
// route already had to avoid for the same reason.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';
import { setFamilySessionCookie } from '@/lib/familyAccess';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Rate limit BEFORE touching the DB — this endpoint's entire job is
  // "guess an email correctly," so it's the one place in this whole
  // feature most worth protecting against brute-forcing name-pattern
  // email addresses (firstname.lastname@, etc.) against a known token.
  const limited = await checkRateLimit(request, 'family-access-verify', {
    windowMs: 15 * 60 * 1000,
    max:      8,
  });
  if (limited) return limited;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }

  const submittedEmail = body.email?.trim().toLowerCase();
  if (!submittedEmail) {
    return NextResponse.json({ success: false, error: 'Enter the email address on file for this memorial.' }, { status: 400 });
  }

  const handover = await prisma.memorialHandover.findUnique({
    where:  { familyAccessToken: token },
    select: {
      id:                    true,
      memorialId:            true,
      status:                true,
      familyContactEmail:    true,
      familyAccessEnabled:   true,
      familyAccessRevokedAt: true,
    },
  });

  // Same generic error for "no such token" and "wrong email" — a
  // different message for each would let someone confirm a token is
  // real before they've guessed the right email.
  const genericError = 'That email doesn\u2019t match our records for this memorial.';

  if (!handover || handover.status !== 'COMPLETED') {
    return NextResponse.json({ success: false, error: genericError }, { status: 401 });
  }

  if (!handover.familyAccessEnabled || handover.familyAccessRevokedAt) {
    return NextResponse.json({ success: false, error: 'Family access is not currently available for this memorial. Please contact the funeral home.' }, { status: 403 });
  }

  if (handover.familyContactEmail.trim().toLowerCase() !== submittedEmail) {
    return NextResponse.json({ success: false, error: genericError }, { status: 401 });
  }

  await setFamilySessionCookie(handover.id, handover.memorialId);

  return NextResponse.json({
    success: true,
    data: { memorialId: handover.memorialId },
  });
}
