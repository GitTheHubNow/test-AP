/**
 * lib/stripe.ts
 *
 * Stripe client singleton + billing configuration.
 * Import stripe from here everywhere — never instantiate Stripe directly.
 *
 * PRICING MODEL (changed from the original 3-tier STARTER/PROFESSIONAL/
 * ENTERPRISE flat-fee design — see git history if you need the old
 * version for reference):
 *
 *   $99/month base subscription fee, PLUS $199 per memorial created,
 *   billed as Stripe metered usage. One plan for every customer — there
 *   is no tier selection anymore.
 *
 * The OrgPlan enum (STARTER/PROFESSIONAL/ENTERPRISE) still exists in the
 * Prisma schema — deliberately NOT removed, to avoid a bigger migration
 * two days before a walkthrough — but every org now just sits on
 * whatever its @default is (STARTER) and the value is not treated as
 * meaningful anywhere in this file or its consumers anymore. Do not
 * resurrect tier-based logic without updating this comment.
 *
 * Setup:
 *   npm install stripe
 *   Add to .env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *                STRIPE_BASE_PRICE_ID, STRIPE_MEMORIAL_PRICE_ID
 *
 *   STRIPE_BASE_PRICE_ID     — the $99/mo flat recurring price
 *   STRIPE_MEMORIAL_PRICE_ID — the $199/memorial METERED price
 *     (Stripe Dashboard → Products → Add price → Usage-based pricing,
 *     NOT a standard recurring price — metered prices report usage via
 *     the API rather than a fixed quantity)
 */

import Stripe from 'stripe';

// ── Client singleton ─────────────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
  typescript: true,
});

// ── Price IDs ─────────────────────────────────────────────────────────────────

export function getBasePriceId(): string {
  const id = process.env.STRIPE_BASE_PRICE_ID;
  if (!id) throw new Error('STRIPE_BASE_PRICE_ID is not set');
  return id;
}

export function getMemorialPriceId(): string {
  const id = process.env.STRIPE_MEMORIAL_PRICE_ID;
  if (!id) throw new Error('STRIPE_MEMORIAL_PRICE_ID is not set');
  return id;
}

// ── Display info (for UI) ───────────────────────────────────────────────────

export const BILLING_DISPLAY = {
  baseFeeAud:      99,
  perMemorialAud:  199,
  description:     '$99/month base fee, plus $199 per memorial created.',
};

// ── Feature access ───────────────────────────────────────────────────────────
//
// Previously plan-tier-gated (guestBook, analytics, customBranding,
// apiAccess were PROFESSIONAL/ENTERPRISE-only). Under the single-plan
// model every paying org gets every feature — there's no tier to gate
// on. checkFeature() in lib/entitlement.ts now always returns true for
// an org with an active/trialing subscription; see that file.
//
// storageMbPerMemorial is kept here as a flat per-memorial storage cap
// (not billing-tier-related) — same limit for everyone. NOT currently
// enforced anywhere (flagged separately, out of scope for this change).
export const STORAGE_MB_PER_MEMORIAL = 5120; // 5GB
