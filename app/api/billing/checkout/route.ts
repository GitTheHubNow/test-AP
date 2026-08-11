/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for upgrading to a paid plan.
 * Redirects to Stripe-hosted checkout page.
 *
 * Body: { plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' }
 * Returns: { url: string }  — redirect the client to this URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { stripe, getPriceIdForPlan, PLAN_DISPLAY } from '@/lib/stripe';
import { getOrgForUser }              from '@/lib/tenant';
import type { OrgPlan }               from '@prisma/client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { plan, onboarding } = body as { plan?: OrgPlan; onboarding?: boolean };

    if (!plan || !['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(plan)) {
      return NextResponse.json(
        { success: false, error: 'Invalid plan. Must be STARTER, PROFESSIONAL, or ENTERPRISE' },
        { status: 400 }
      );
    }

    const priceId = getPriceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: `Price ID not configured for plan ${plan}. Set STRIPE_${plan}_PRICE_ID in env.` },
        { status: 500 }
      );
    }

    // Resolve org
    const org = await getOrgForUser(userId);
    if (org.role !== 'OWNER' && org.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only the account owner can manage billing' },
        { status: 403 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = org.stripeCustomerId;

    if (!stripeCustomerId) {
      // Check StripeCustomer table (legacy per-user record)
      const legacyCustomer = await prisma.stripeCustomer.findUnique({
        where: { userId },
      });

      if (legacyCustomer) {
        stripeCustomerId = legacyCustomer.stripeCustomerId;
        // Migrate to org-level
        await prisma.organisation.update({
          where: { id: org.id },
          data:  { stripeCustomerId },
        });
      } else {
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          metadata: {
            clerkUserId: userId,
            orgId:       org.id,
            orgSlug:     org.slug,
          },
        });
        stripeCustomerId = customer.id;
        await Promise.all([
          prisma.organisation.update({
            where: { id: org.id },
            data:  { stripeCustomerId },
          }),
          prisma.stripeCustomer.upsert({
            where:  { userId },
            create: { userId, stripeCustomerId },
            update: { stripeCustomerId },
          }),
        ]);
      }
    }

    // Trial length is platform-admin-controlled (see
    // app/api/system/trial-settings/route.ts and
    // components/system/TrialSettingsPanel.tsx) rather than a fixed
    // 14 days, so promos ("2 months free") can be toggled without a
    // code deploy. Falls back to 30 if the settings row is somehow
    // missing (upsert in the settings route means this should be rare,
    // but checkout must never 500 just because that row is absent).
    const platformSettings = await prisma.platformSettings.findUnique({
      where: { id: 'singleton' },
      select: { trialDays: true },
    });
    const trialDays = platformSettings?.trialDays ?? 30;

    // success_url differs for the onboarding flow: it routes back through
    // /dashboard?onboarded=1 so the dashboard can show the one-time
    // "invite your team" nudge, instead of the normal
    // /dashboard/billing?success=1 destination used when an existing user
    // upgrades their plan later.
    const successUrl = onboarding
      ? `${APP_URL}/dashboard?onboarded=1&plan=${plan}`
      : `${APP_URL}/dashboard/billing?success=1&plan=${plan}`;

    // Create Checkout session
    const session = await stripe.checkout.sessions.create({
      customer:             stripeCustomerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      // Without this, Stripe only collects a card if payment is due
      // immediately — for a trialing subscription (trial_period_days set
      // below) that means NO card is collected by default, contradicting
      // the "collect card up front, don't charge until trial ends"
      // requirement this was meant to satisfy. Must be explicit.
      payment_method_collection: 'always',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          orgId:   org.id,
          orgSlug: org.slug,
          plan,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: successUrl,
      cancel_url:  onboarding
        ? `${APP_URL}/onboarding/payment?cancelled=1`
        : `${APP_URL}/dashboard/billing?cancelled=1`,
      metadata: {
        orgId: org.id,
        plan,
      },
    });

    return NextResponse.json({ success: true, url: session.url });

  } catch (error) {
    console.error('[POST /api/billing/checkout]', error);
    return NextResponse.json({ success: false, error: 'Failed to create checkout session' }, { status: 500 });
  }
}
