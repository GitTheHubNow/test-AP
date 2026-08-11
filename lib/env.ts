import { z } from 'zod';

/**
 * CRITICAL PRODUCTION SAFETY - Environment Validation
 *
 * Was previously "Minimal implementation for Option C" — only validated
 * 5 of the ~20 env vars the app actually depends on (DATABASE_URL, Clerk
 * keys, APP_URL, NODE_ENV). Missing: Stripe (secret key, webhook secret,
 * 3 price IDs), Resend, CRON_SECRET, AWS/S3, IP_HASH_SALT,
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

  // Stripe — billing/checkout will fail at request-time without these;
  // catching it at boot instead of on a live user's first checkout
  // attempt is the whole point of this file existing.
  STRIPE_SECRET_KEY: z.string().min(1).startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).startsWith('whsec_'),
  STRIPE_STARTER_PRICE_ID: z.string().min(1).startsWith('price_'),
  STRIPE_PROFESSIONAL_PRICE_ID: z.string().min(1).startsWith('price_'),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1).startsWith('price_'),

  // Email
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email().optional(), // has a code fallback (lib/email.ts) — safe to omit
  PRODUCT_ORDER_EMAIL: z.string().email().optional(),

  // Cron — every app/api/cron/* route checks this at request time and
  // already fails safe (rejects) if unset, but catching it at boot is
  // still strictly better than discovering it when a scheduled job
  // silently never authenticates.
  CRON_SECRET: z.string().min(16, 'CRON_SECRET should be a long random string, not a short/guessable value'),

  // Abuse-tracking salt — has a hardcoded fallback in code
  // ('memoriam-salt') if unset, which defeats the point of salting.
  // Not making this hard-required (won't crash boot over it, since the
  // fallback technically "works"), but surfaced as a warning below.
  IP_HASH_SALT: z.string().min(1).optional(),

  // Platform admin allowlist — genuinely optional; empty means nobody is
  // a platform admin, which is a safe (if inconvenient) default. Not
  // validated as required.
  PLATFORM_ADMIN_USER_IDS: z.string().optional(),

  // AWS/S3 — production-only. See class-level comment above.
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_S3_BUCKET: z.string().min(1).optional(),
}).refine(
  (env) => {
    if (env.NODE_ENV !== 'production') return true;
    return !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_S3_BUCKET);
  },
  {
    message: 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are required when NODE_ENV=production (lib/storage-server.ts uses S3 in production, local disk otherwise)',
    path: ['AWS_S3_BUCKET'],
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
