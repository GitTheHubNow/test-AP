/**
 * lib/stripe.ts
 *
 * Stripe client singleton + plan configuration.
 * Import stripe from here everywhere — never instantiate Stripe directly.
 *
 * Setup:
 *   npm install stripe
 *   Add to .env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *                STRIPE_STARTER_PRICE_ID, STRIPE_PROFESSIONAL_PRICE_ID,
 *                STRIPE_ENTERPRISE_PRICE_ID
 */

import Stripe from 'stripe';
import type { OrgPlan } from '@prisma/client';

// ── Client singleton ─────────────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
  typescript: true,
});

// ── Plan limits ──────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<OrgPlan, {
  memorialsPerMonth: number;
  videosPerMonth:    number;
  seats:             number;
  storageMbPerMemorial: number;
  guestBook:         boolean;
  analytics:         boolean;
  customBranding:    boolean;
  apiAccess:         boolean;
}> = {
  STARTER: {
    memorialsPerMonth:    10,
    videosPerMonth:       3,
    seats:                1,
    storageMbPerMemorial: 200,
    guestBook:            false,
    analytics:            false,
    customBranding:       false,
    apiAccess:            false,
  },
  PROFESSIONAL: {
    memorialsPerMonth:    Infinity,
    videosPerMonth:       Infinity,
    seats:                3,
    storageMbPerMemorial: 1024,
    guestBook:            true,
    analytics:            true,
    customBranding:       false,
    apiAccess:            false,
  },
  ENTERPRISE: {
    memorialsPerMonth:    Infinity,
    videosPerMonth:       Infinity,
    seats:                Infinity,
    storageMbPerMemorial: 5120,
    guestBook:            true,
    analytics:            true,
    customBranding:       true,
    apiAccess:            true,
  },
};

// ── Price ID → Plan mapping ──────────────────────────────────────────────────
// Set these in your .env after creating products in Stripe Dashboard.
// Stripe Dashboard → Products → Create product → Add price → copy price ID.

export function getPlanFromPriceId(priceId: string): OrgPlan | null {
  const map: Record<string, OrgPlan> = {
    [process.env.STRIPE_STARTER_PRICE_ID!]:      'STARTER',
    [process.env.STRIPE_PROFESSIONAL_PRICE_ID!]: 'PROFESSIONAL',
    [process.env.STRIPE_ENTERPRISE_PRICE_ID!]:   'ENTERPRISE',
  };
  return map[priceId] ?? null;
}

export function getPriceIdForPlan(plan: OrgPlan): string {
  const map: Record<OrgPlan, string> = {
    STARTER:      process.env.STRIPE_STARTER_PRICE_ID!,
    PROFESSIONAL: process.env.STRIPE_PROFESSIONAL_PRICE_ID!,
    ENTERPRISE:   process.env.STRIPE_ENTERPRISE_PRICE_ID!,
  };
  return map[plan];
}

// ── Plan display info (for UI) ───────────────────────────────────────────────

export const PLAN_DISPLAY: Record<OrgPlan, {
  name:        string;
  priceAud:    number;
  description: string;
}> = {
  STARTER: {
    name:        'Starter',
    priceAud:    49,
    description: '10 memorials/month, 3 tribute videos, basic QR codes',
  },
  PROFESSIONAL: {
    name:        'Professional',
    priceAud:    99,
    description: 'Unlimited memorials & videos, guest book, analytics',
  },
  ENTERPRISE: {
    name:        'Enterprise',
    priceAud:    249,
    description: 'Everything in Professional plus custom branding and API access',
  },
};
