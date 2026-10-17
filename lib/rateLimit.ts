// lib/rateLimit.ts
//
// IP-based rate limiting for public, unauthenticated write endpoints.
//
// This follows the exact pattern already used and working in
// app/api/public/memorial/[token]/guest-book/route.ts (hash the IP,
// count recent rows in a time window, reject if over the limit) — that
// route has its own ipHash column on GuestBookEntry since it only needed
// to protect itself. Memory, Media, and Reaction don't have an
// equivalent column, so this writes to a small shared RateLimitHit table
// instead of duplicating a hashIp()/count() pair in every route file.
//
// Usage in a route handler:
//
//   import { checkRateLimit } from '@/lib/rateLimit';
//
//   const limited = await checkRateLimit(request, 'memory', memorial.id, {
//     max: 5, windowMs: 10 * 60 * 1000,
//   });
//   if (limited) return limited;
//
// Deliberately NOT using Upstash/Redis here even though those env vars
// exist in .env — they're currently unused anywhere else in the app, and
// introducing a second rate-limiting mechanism (DB-based here, Redis
// elsewhere) is more inconsistent than reusing the pattern that's
// already proven in guest-book. Revisit if traffic volume ever makes the
// DB-write-per-request cost here matter — not a launch-day concern.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { getIpHashSalt } from '@/lib/ipSalt';

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

/**
 * Same hashing approach as guest-book/route.ts's hashIp() — kept
 * identical (including the same env var and fallback salt) so an IP
 * hashes to the same value across every endpoint that rate-limits it,
 * which matters if these are ever compared/joined for abuse analysis
 * later.
 */
function hashIp(ip: string): string {
  return createHash('sha256')
    .update(ip + getIpHashSalt())
    .digest('hex')
    .slice(0, 16);
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

/**
 * Check + record a rate-limited hit. Returns null if the request is
 * allowed (caller proceeds normally, and this call has already recorded
 * the hit). Returns a 429 NextResponse if the caller should stop and
 * return this directly.
 *
 * `bucket` should be a stable string identifying the endpoint + resource
 * being limited, e.g. `memory:${memorial.id}` — scoping by memorial (not
 * just by endpoint globally) means one memorial being hammered doesn't
 * eat into the allowance for a real visitor on a different memorial.
 */
export async function checkRateLimit(
  request: NextRequest,
  bucket: string,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - options.windowMs);

  // RECORD FIRST, THEN RANK. The old order (count, then insert) let a burst
  // of parallel requests all read "0 recent hits" before any of them had
  // written one, so every request in the burst was admitted — defeating the
  // limit exactly where it matters most (e.g. guessing emails on
  // family-access/verify).
  //
  // Now each request inserts its own hit, then counts only the hits that
  // arrived at or before it (ties broken by id). That gives it a stable
  // rank: ranks 1..max are admitted, everything after is rejected — exactly
  // `max` get through however many arrive at once, and a request's rank
  // doesn't depend on how many later ones are still in flight.
  const hit = await prisma.rateLimitHit.create({
    data: { bucket, ipHash }, select: { id: true, createdAt: true },
  });

  const rank = await prisma.rateLimitHit.count({
    where: {
      bucket, ipHash,
      createdAt: { gte: since, lte: hit.createdAt },
      NOT: { createdAt: hit.createdAt, id: { gt: hit.id } },
    },
  });

  if (rank > options.max) {
    // Don't let rejected attempts extend the caller's own lockout.
    await prisma.rateLimitHit.delete({ where: { id: hit.id } }).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  return null;
}
