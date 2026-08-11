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
    .update(ip + (process.env.IP_HASH_SALT ?? 'memoriam-salt'))
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

  const recentCount = await prisma.rateLimitHit.count({
    where: { bucket, ipHash, createdAt: { gte: since } },
  });

  if (recentCount >= options.max) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  // Record this hit. Fire-and-forget would risk under-counting under
  // concurrent requests; awaiting keeps the count accurate at the cost
  // of one extra write per request, which is the same tradeoff
  // guest-book already makes.
  await prisma.rateLimitHit.create({ data: { bucket, ipHash } });

  return null;
}
