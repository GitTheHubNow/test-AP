/**
 * lib/rate-limit.ts
 *
 * Shared rate-limiting helper for public/abuse-prone endpoints, built on
 * @upstash/ratelimit + @upstash/redis (already a dependency per the
 * handover doc, previously unwired anywhere in the app).
 *
 * Setup required (.env):
 *   UPSTASH_REDIS_REST_URL=...
 *   UPSTASH_REDIS_REST_TOKEN=...
 * (from the Upstash console — free tier is enough for this traffic profile)
 *
 * Usage in a route:
 *
 *   import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
 *
 *   export async function POST(request: NextRequest) {
 *     const rl = await rateLimit('collect', request);
 *     if (!rl.success) return rateLimitResponse(rl);
 *     ...
 *   }
 *
 * FAIL-OPEN BY DESIGN: if Upstash env vars are missing or Redis is
 * unreachable, rateLimit() logs a warning and returns { success: true }
 * rather than throwing / blocking all traffic. A rate limiter outage
 * should degrade to "no rate limiting", not "site down" — the routes
 * this protects already have their own auth/token checks as the real
 * security boundary; rate limiting is defence-in-depth on top of that,
 * not the only thing standing between the public internet and the DB.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

// ── Redis client ─────────────────────────────────────────────────────────────

let redis: Redis | null = null;
let redisInitAttempted = false;

function getRedis(): Redis | null {
  if (redisInitAttempted) return redis;
  redisInitAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — ' +
      'rate limiting is DISABLED (fail-open). Set these env vars before launch.',
    );
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

// ── Named limiter configs ────────────────────────────────────────────────────
//
// Each key here is a distinct abuse surface with its own tolerance.
// Keep these conservative but not so tight that a real family member
// uploading several photos in a row gets blocked.

type LimiterName =
  | 'collect-upload'      // POST /api/collect/[token]
  | 'memorial-unlock'     // POST /api/memorial-access/unlock
  | 'org-invite-info'     // GET  /api/org/invite/[token]
  | 'onboarding-create-org'; // POST /api/onboarding/create-org

const LIMITER_CONFIG: Record<LimiterName, { limit: number; windowSeconds: number }> = {
  // Family members uploading a handful of photos/videos in a session —
  // generous enough for a real burst, tight enough to stop scripted abuse.
  'collect-upload': { limit: 20, windowSeconds: 60 },

  // Token-guessing target — publicToken is a UUID-length secret, but this
  // is still the actual authority check, so keep it tight. Legitimate
  // traffic here is at most a handful of calls per visitor (page load +
  // maybe a retry), never dozens.
  'memorial-unlock': { limit: 10, windowSeconds: 60 },

  // Enumerable by token; legitimate traffic is one load of the invite
  // page, maybe a manual refresh. No reason for more than a few per
  // minute from one source.
  'org-invite-info': { limit: 15, windowSeconds: 60 },

  // Authenticated (Clerk) but still worth bounding — stops one
  // compromised/scripted account from hammering org creation attempts.
  'onboarding-create-org': { limit: 5, windowSeconds: 60 },
};

const limiters = new Map<LimiterName, Ratelimit>();

function getLimiter(name: LimiterName): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;

  if (!limiters.has(name)) {
    const { limit, windowSeconds } = LIMITER_CONFIG[name];
    limiters.set(
      name,
      new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
        analytics: true,
        prefix: `memoriam:ratelimit:${name}`,
      }),
    );
  }
  return limiters.get(name)!;
}

// ── Identifier resolution ────────────────────────────────────────────────────

/**
 * Best-effort caller identifier for rate-limit bucketing.
 * Prefers the platform-provided client IP header; falls back to a
 * constant bucket (effectively global rate limiting) only if no IP
 * signal is available at all, which should be rare behind Vercel.
 */
function resolveIdentifier(request: NextRequest, extra?: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown-ip';
  return extra ? `${ip}:${extra}` : ip;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms
}

/**
 * Check + consume one request against the named limiter.
 *
 * @param name    which limiter config to use (see LIMITER_CONFIG)
 * @param request the incoming request (used to resolve caller IP)
 * @param extra   optional extra key component to bucket per-resource
 *                rather than purely per-IP — e.g. pass the invite token
 *                so one IP can't be used to hammer many different
 *                tokens while staying under a purely-IP-based limit,
 *                or pass userId for authenticated routes.
 */
export async function rateLimit(
  name: LimiterName,
  request: NextRequest,
  extra?: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(name);

  // Fail-open: no Redis configured/reachable → allow the request.
  if (!limiter) {
    return { success: true, limit: -1, remaining: -1, reset: 0 };
  }

  try {
    const identifier = resolveIdentifier(request, extra);
    const result = await limiter.limit(identifier);
    return result;
  } catch (error) {
    // Redis reachable at getRedis() time but this call failed (network
    // blip, etc.) — fail open rather than 500ing real traffic.
    console.error('[rate-limit] limiter.limit() threw, failing open:', error);
    return { success: true, limit: -1, remaining: -1, reset: 0 };
  }
}

/**
 * Standard 429 response for a failed rate-limit check, with the usual
 * RateLimit-* headers set so well-behaved clients can back off correctly.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    { success: false, error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    },
  );
}
