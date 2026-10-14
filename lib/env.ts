import { z } from 'zod';

/**
 * CRITICAL PRODUCTION SAFETY - Environment Validation
 *
 * Was previously "Minimal implementation for Option C" — only validated
 * 5 of the ~20 env vars the app actually depends on (DATABASE_URL, Clerk
 * keys, APP_URL, NODE_ENV). Missing: Resend, CRON_SECRET, AWS/S3, IP_HASH_SALT,
 * PLATFORM_ADMIN_USER_IDS. Expanded below to cover all of them.
 *
 * ALSO — this file was never actually imported anywhere in the app, so
 * its startup validation block (bottom of this file) never ran at all,
 * despite looking like real boot-time protection including a
 * process.exit(1) fail-fast. See instrumentation.ts for the fix that
 * makes this actually execute on server start.
 *
 * AWS_* vars are validated only when NODE_ENV === 'production', matching
 * lib/storage-server.ts's actual runtime behaviour (dev writes to local
 * disk instead of S3) — requiring them unconditionally would break local
 * dev for no reason.
 */

const EnvSchema = z.object({
  // Core / always required
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  CLERK_SECRET_KEY: z.string().min(1).startsWith('sk_'),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).startsWith('pk_'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Manual (invoice-based) billing — see lib/billing/. All optional so the
  // app boots without them; statements simply cannot be SENT until
  // BILLING_PAYMENT_INSTRUCTIONS is set (a bill with no way to pay it is
  // refused by lib/billing/statements.ts, and a warning is logged at boot).
  BILLING_PAYMENT_INSTRUCTIONS: z.string().optional(), // bank details etc; "\\n" = line break
  // Empty string (a blank var in Vercel) is treated as unset, not as 0.
  BILLING_DUE_DAYS: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().positive().max(365).optional(),
  ), // default 14
  BILLING_TIMEZONE: z.string().optional(),             // default Australia/Sydney
  // Forgiving on purpose: TRUE / True / 1 / yes / on all mean true; FALSE / 0 / no / off / blank mean false.
  // A typo in an optional flag must never stop the whole site from booting.
  BILLING_AUTO_SEND: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(t)) return 'true';
    if (['false', '0', 'no', 'off', ''].includes(t)) return 'false';
    return 'false'; // unrecognised → safest default (do NOT auto-send)
  }, z.enum(['true', 'false']).optional()), // email statements automatically from the monthly cron

  // Email
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email().optional(), // has a code fallback (lib/email.ts) — safe to omit
  PRODUCT_ORDER_EMAIL: z.string().email().optional(),

  // Cron — every app/api/cron/* route checks this at request time and
  // already fails safe (rejects) if unset, but catching it at boot is
  // still strictly better than discovering it when a scheduled job
  // silently never authenticates.
  CRON_SECRET: z.string().min(16, 'CRON_SECRET should be a long random string, not a short/guessable value'),

  // Signs the family self-service access cookie (lib/familyAccess.ts).
  // Hard-required, like CRON_SECRET above, not soft-optional like
  // IP_HASH_SALT below — there is no safe fallback if this is unset;
  // the whole family-access feature simply throws at first use rather
  // than degrading. A dedicated secret, deliberately not reused from
  // CRON_SECRET or IP_HASH_SALT — rotating one for a real reason
  // (a suspected leak) should never silently affect the other two.
  FAMILY_SESSION_SECRET: z.string().min(16, 'FAMILY_SESSION_SECRET should be a long random string, not a short/guessable value'),

  // Abuse-tracking salt — has a hardcoded fallback in code
  // ('memoriam-salt') if unset, which defeats the point of salting.
  // Not making this hard-required (won't crash boot over it, since the
  // fallback technically "works"), but surfaced as a warning below.
  IP_HASH_SALT: z.string().min(1).optional(),

  // Platform admin allowlist — genuinely optional; empty means nobody is
  // a platform admin, which is a safe (if inconvenient) default. Not
  // validated as required.
  PLATFORM_ADMIN_USER_IDS: z.string().optional(),

  // AWS/S3 (Cloudflare R2) — production-only. See class-level comment above.
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_S3_BUCKET: z.string().min(1).optional(),
  // lib/storage-s3.ts builds the R2 endpoint as
  // `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`. This was
  // referenced there (and in scripts/check-ffmpeg-core.ts) but never
  // added to this schema, so a missing value wouldn't fail boot — it
  // would boot cleanly and then every upload/signed-URL call would fail
  // at request time trying to resolve "undefined.r2.cloudflarestorage.com".
  CF_ACCOUNT_ID: z.string().min(1).optional(),
}).refine(
  (env) => {
    if (env.NODE_ENV !== 'production') return true;
    return !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_S3_BUCKET && env.CF_ACCOUNT_ID);
  },
  {
    message: 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, and CF_ACCOUNT_ID are required when NODE_ENV=production (lib/storage-server.ts uses S3/R2 in production, local disk otherwise)',
    path: ['AWS_S3_BUCKET'],
  },
).refine(
  (env) => {
    if (env.NODE_ENV !== 'production') return true;
    // z.string().url() alone can't catch this — "http://localhost:3000"
    // is a perfectly valid URL, just the wrong one. Found live: this
    // variable was set to localhost:3000 in the real Vercel Production
    // environment (not a code bug — someone left/typed the dev default
    // into the Production env var), and every QR code, collection-invite
    // link, and handover-acceptance link generated in the meantime
    // pointed there instead of the real domain.
    return !env.NEXT_PUBLIC_APP_URL.includes('localhost');
  },
  {
    message: 'NEXT_PUBLIC_APP_URL is set to localhost in production — set it to your real deployed URL (e.g. https://your-domain.vercel.app) in Vercel\'s Production environment variables',
    path: ['NEXT_PUBLIC_APP_URL'],
  },
);

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

/**
 * Get validated environment variables
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`);
    console.error('❌ Environment validation failed:\n' + errors.join('\n'));
    throw new Error('Invalid environment configuration');
  }

  cachedEnv = result.data;

  if (!cachedEnv.IP_HASH_SALT) {
    console.warn(
      '⚠️  IP_HASH_SALT is not set — falling back to the hardcoded salt in ' +
      'lib/rateLimit.ts. That salt is visible in source and defeats the ' +
      'purpose of hashing IPs (anyone with the codebase could pre-compute ' +
      'a reverse-lookup table). Not fatal, but set this before launch.',
    );
  }

  if (!cachedEnv.BILLING_PAYMENT_INSTRUCTIONS) {
    console.warn(
      '⚠️  BILLING_PAYMENT_INSTRUCTIONS is not set — billing statements cannot ' +
      'be emailed until it is (your bank details / how customers should pay).',
    );
  }

  return cachedEnv;
}

/**
 * Check if production
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

// Startup validation lives in instrumentation.ts, not here — a
// module-level side effect only runs if something imports this file,
// and nothing did, so the previous version of this block never
// actually executed despite looking like real boot-time protection
// (including a process.exit(1) fail-fast that never fired).
// instrumentation.ts's register() is a real Next.js lifecycle hook
// that's guaranteed to run once per server start.
