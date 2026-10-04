// app/api/public/memorial/[token]/memory/route.ts
//
// POST /api/public/memorial/[token]/memory — public, no auth. Called by
// MemoryForm in components/memorial/MemorialPageClient.tsx (the live
// MEMORIAL_OPEN view on /v/[slug]) to submit a written memory.
//
// THIS ROUTE DID NOT EXIST. Confirmed before writing it: zero
// `prisma.memory.create` calls anywhere in the app, and MemoryForm's own
// comment ("Posts to /api/public/memorial/[token]/memory, which was broken
// (token lookup bug) until this audit pass") plus a second, independent
// comment in lib/rateLimit.ts ("the same tradeoff guest-book already
// makes") both talk about this route and its sibling as if they already
// existed — they don't, in this codebase. The full moderation system this
// feeds (approve/reject/feature on the staff Moderation tab) is built and
// working; it just had nothing creating the rows it moderates. Built to
// match what that moderation system and the frontend already expect,
// rather than redesigning either.
//
// [token] here is the memorial's SLUG, not its publicToken — see the
// `token: slug` comment in app/v/[slug]/page.tsx: "Not used for any
// access-control logic." Submitting a memory isn't a secret-gated action;
// anyone who can see the public page (which the page itself already gates
// on qrState === MEMORIAL_OPEN before even rendering this form) can leave
// one, same as anyone can comment on a public post. The `status: ACTIVE`
// check below is a server-side mirror of that gate, for anyone who skips
// the page and calls this route directly.
//
// Submitted memories always land PENDING — matches MemoryForm's own
// comment ("Submitted memories are PENDING until staff approve them").

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus, MemoryCategory, MemorialStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode, createAuditEvent } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rateLimit';

const MAX_MESSAGE_LEN = 5000;     // matches MemoryForm's textarea maxLength
const MAX_AUTHOR_LEN  = 100;      // matches MemoryForm's input maxLength

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: slug } = await params;

  // Memories are meant to be considered, not rapid-fire — generous enough
  // for genuine use, tight enough to blunt a script. Bucketed per-memorial
  // slug so one memorial's traffic can't exhaust another's allowance.
  const limited = await checkRateLimit(request, `public-memory:${slug}`, {
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
    // Deliberately vague — same reasoning as memorial-access/unlock's
    // generic error: don't let the response shape confirm whether a
    // memorial exists but is archived/suspended vs genuinely absent.
    return NextResponse.json({ success: false, error: 'This memorial is not accepting new memories' }, { status: 403 });
  }

  let body: { authorName?: string; message?: string };
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

  const memory = await prisma.memory.create({
    data: {
      memorialId:  memorial.id,
      authorName,
      message,
      status:      MemoryStatus.PENDING,
      category:    MemoryCategory.GENERAL,
      isGuestBook: false,
    },
    select: { id: true, status: true, createdAt: true },
  });

  // Non-blocking — a submission shouldn't fail because audit logging did.
  // Matches the pattern in lib/auditRead.ts (which IS wired to swallow its
  // own errors), not a new convention.
  try {
    await createAuditEvent({
      entityType: EntityType.MEMORY,
      entityId:   memory.id,
      action:     AuditAction.CREATE,
      actorId:    'public',
      actorRole:  ActorRole.PUBLIC,
      reasonCode: ReasonCode.CREATION,
      metadata:   { memorialId: memorial.id },
    });
  } catch (err) {
    console.error('[public memory] audit log failed (non-blocking):', err);
  }

  return NextResponse.json({
    success: true,
    data: { entry: { id: memory.id, status: memory.status, createdAt: memory.createdAt } },
  });
}
