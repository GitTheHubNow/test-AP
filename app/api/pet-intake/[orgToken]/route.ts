// app/api/pet-intake/[orgToken]/route.ts
//
// POST /api/pet-intake/[orgToken] — public, no auth. Anyone who scans the
// org's printed QR code (which encodes Organisation.petIntakeToken) hits
// this to submit pet/owner details.
//
// Deliberately posture-matched to the OTHER public submission routes in
// this codebase (collect/[token], upload/[token]) but with one real
// difference: those use a per-submission or per-invite token generated
// by staff beforehand; this uses one FIXED, reusable org-level token
// (printed once). That changes the abuse model — there's no invite
// record with an expiry/upload-count to lean on, so this route leans
// more on: (1) landing in PENDING for staff review rather than creating
// a live PetCase, (2) a tighter per-org rate limit, (3) an ipHash
// recorded for spam pattern-spotting, (4) a honeypot field.

import { NextRequest, NextResponse } from 'next/server';
import { createHash }                 from 'crypto';
import { prisma }                     from '@/lib/prisma';
import { checkRateLimit }             from '@/lib/rateLimit';

const VALID_SOURCES = ['VET', 'OWNER', 'WALK_IN'] as const;

function hashIp(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null;
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgToken: string }> },
) {
  const { orgToken } = await params;

  // Per-org bucket, tighter than the invite-token routes (20/min) since
  // there's no per-submission token limiting scope the way an invite
  // does — a fixed public QR code is a more attractive spam target.
  const limited = await checkRateLimit(req, `pet-intake:${orgToken}`, { max: 10, windowMs: 60 * 1000 });
  if (limited) return limited;

  const org = await prisma.organisation.findUnique({
    where:  { petIntakeToken: orgToken },
    select: { id: true, featurePetAftercare: true, name: true, brandName: true, primaryColor: true, logoUrl: true },
  });

  if (!org || !org.featurePetAftercare) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  let body: {
    submittedBy?:       string;
    petName?:           string;
    species?:           string;
    breed?:             string;
    ownerContactName?:  string;
    ownerContactEmail?: string;
    ownerContactPhone?: string;
    vetClinicName?:     string;
    vetContactName?:    string;
    vetContactEmail?:   string;
    vetContactPhone?:   string;
    serviceType?:       string;
    notes?:             string;
    // Honeypot — a real person never sees or fills this field (hidden via
    // CSS in the form); a bot filling every field on the page will.
    website?:           string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  // Honeypot tripped — pretend success so the bot doesn't learn to adapt,
  // but don't actually write anything.
  if (body.website?.trim()) {
    return NextResponse.json({ success: true, data: { submitted: true } });
  }

  if (!body.petName?.trim()) {
    return NextResponse.json({ success: false, error: "Pet's name is required" }, { status: 400 });
  }
  if (!body.ownerContactName?.trim()) {
    return NextResponse.json({ success: false, error: 'Owner name is required' }, { status: 400 });
  }

  let submittedBy: (typeof VALID_SOURCES)[number] = 'OWNER';
  if (body.submittedBy !== undefined) {
    if (!VALID_SOURCES.includes(body.submittedBy as any)) {
      return NextResponse.json(
        { success: false, error: `submittedBy must be one of: ${VALID_SOURCES.join(', ')}` },
        { status: 400 },
      );
    }
    submittedBy = body.submittedBy as (typeof VALID_SOURCES)[number];
  }

  // At least one contact method for the owner — a request with a name
  // but no way to reach them is close to useless to staff reviewing it.
  if (!body.ownerContactEmail?.trim() && !body.ownerContactPhone?.trim()) {
    return NextResponse.json(
      { success: false, error: 'Please provide an email or phone number so we can reach the owner' },
      { status: 400 },
    );
  }

  const intakeRequest = await prisma.petIntakeRequest.create({
    data: {
      organisationId:    org.id,
      submittedBy,
      petName:           body.petName.trim(),
      species:           body.species?.trim()           || null,
      breed:             body.breed?.trim()              || null,
      ownerContactName:  body.ownerContactName.trim(),
      ownerContactEmail: body.ownerContactEmail?.trim()  || null,
      ownerContactPhone: body.ownerContactPhone?.trim()  || null,
      vetClinicName:     submittedBy === 'VET' ? (body.vetClinicName?.trim()  || null) : null,
      vetContactName:    submittedBy === 'VET' ? (body.vetContactName?.trim() || null) : null,
      vetContactEmail:   submittedBy === 'VET' ? (body.vetContactEmail?.trim()|| null) : null,
      vetContactPhone:   submittedBy === 'VET' ? (body.vetContactPhone?.trim()|| null) : null,
      serviceType:       body.serviceType?.trim()        || null,
      notes:             body.notes?.trim()               || null,
      ipHash:            hashIp(req),
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, data: { requestId: intakeRequest.id } }, { status: 201 });
}
