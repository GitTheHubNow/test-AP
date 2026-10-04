// app/api/public/memorial/[token]/guest-book/route.ts
//
// POST /api/public/memorial/[token]/guest-book — public, no auth. Called
// by GuestBookForm in components/memorial/MemorialPageClient.tsx.
//
// THIS ROUTE DID NOT EXIST — same situation as the sibling ./memory
// route (see its file header for the full evidence trail). The clearest
// single piece of it: lib/audit.ts's EntityType.GUEST_BOOK_ENTRY has a
// comment reading "guest book moderation (was missing: staff-side page/
// API existed nowhere, only the public submission endpoint did)" — i.e.
// at some point the reverse was true and this route existed. It doesn't,
// in this codebase, now. Built to match what GuestBookForm already sends
// and what the staff moderation routes (guestbook/[entryId]/approve etc.,
// which ARE present and working) already expect to moderate.
//
// Unlike Memory (always PENDING — see the ./memory route), entries here
// auto-approve. GuestBookForm's own handling reads this optimistically
// (`data.data?.entry?.status === 'APPROVED'`) without enforcing it, and
// its code comment calls this out explicitly ("unlike guest book, which
// can auto-show") — a guest book is meant to be a lower-friction "we were
// here" message, not something that needs review before a visitor sees
// their own entry. The schema's flaggedByFilter/filterReason columns
// exist for a future content filter; there isn't one yet (none exists
// anywhere in lib/), so they're always false/null here. Rate limiting is
// the only abuse control right now — worth adding real filtering before
// this gets heavy public traffic.

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { GuestBookStatus, MemorialStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode, createAuditEvent } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rateLimit';

const MAX_MESSAGE_LEN  = 1000;   // matches GuestBookForm's textarea maxLength
const MAX_AUTHOR_LEN   = 100;    // matches GuestBookForm's input maxLength
const MAX_LOCATION_LEN = 100;    // matches GuestBookForm's input maxLength

// Salted — app/api/pet-intake/[orgToken]/route.ts has a near-identical
// local hashIp() but WITHOUT the salt (a plain unsalted SHA-256 of an IP
// is reversible in bulk against the ~4 billion possible IPv4 addresses).
// This one pulls IP_HASH_SALT the same way lib/rateLimit.ts does
// internally, rather than repeating the weaker version.
function hashIp(request: NextRequest): string | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? 'memoriam-salt';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: slug } = await params;

  const limited = await checkRateLimit(request, `public-guestbook:${slug}`, {
    max: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const memorial = await prisma.memorial.findFirst({
    where:  { slug },
    select: { id: true, status: true },
  });
  if (!memorial) {
    return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
  }
  if (memorial.status !== MemorialStatus.ACTIVE) {
    return NextResponse.json({ success: false, error: 'This memorial is not accepting new entries' }, { status: 403 });
  }

  let body: { authorName?: string; message?: string; location?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ success: false, error: 'A message is required' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ success: false, error: `Message must be ${MAX_MESSAGE_LEN} characters or fewer` }, { status: 400 });
  }

  const authorName = (body.authorName ?? '').trim().slice(0, MAX_AUTHOR_LEN) || null;
  const location    = (body.location  ?? '').trim().slice(0, MAX_LOCATION_LEN) || null;

  const entry = await prisma.guestBookEntry.create({
    data: {
      memorialId:      memorial.id,
      authorName,
      message,
      location,
      status:          GuestBookStatus.APPROVED,
      ipHash:          hashIp(request),
      flaggedByFilter: false,
      filterReason:    null,
    },
    select: { id: true, status: true, createdAt: true },
  });

  try {
    await createAuditEvent({
      entityType: EntityType.GUEST_BOOK_ENTRY,
      entityId:   entry.id,
      action:     AuditAction.CREATE,
      actorId:    'public',
      actorRole:  ActorRole.PUBLIC,
      reasonCode: ReasonCode.CREATION,
      metadata:   { memorialId: memorial.id },
    });
  } catch (err) {
    console.error('[public guest-book] audit log failed (non-blocking):', err);
  }

  return NextResponse.json({
    success: true,
    data: { entry: { id: entry.id, status: entry.status, createdAt: entry.createdAt } },
  });
}
