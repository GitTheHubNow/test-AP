/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for the org's subscription.
 *
 * CHANGED — was plan-tier selection (STARTER/PROFESSIONAL/ENTERPRISE),
 * now a single plan for everyone: $99/mo base fee + $199/memorial
 * metered usage. No `plan` body param anymore — every org gets the
 * same two line items.
 *
 * Returns: { url: string }  — redirect the client to this URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { stripe, getBasePriceId, getMemorialPriceId } from '@/lib/stripe';
import { getOrgForUser }              from '@/lib/tenant';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { onboarding } = body as { onboarding?: boolean };

    let basePriceId: string;
    let memorialPriceId: string;
    try {
      basePriceId     = getBasePriceId();
      memorialPriceId = getMemorialPriceId();
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
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
      const legacyCustomer = await prisma.stripeCustomer.findUnique({
        where: { userId },
      });

      if (legacyCustomer) {
        stripeCustomerId = legacyCustomer.stripeCustomerId;
        await prisma.organisation.update({
          where: { id: org.id },
          data:  { stripeCustomerId },
        });
      } else {
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

    // Trial length is platform-admin-controlled — see
    // app/api/system/trial-settings/route.ts.
    const platformSettings = await prisma.platformSettings.findUnique({
      where: { id: 'singleton' },
      select: { trialDays: true },
    });
    const trialDays = platformSettings?.trialDays ?? 30;

    const successUrl = onboarding
      ? `${APP_URL}/dashboard?onboarded=1`
      : `${APP_URL}/dashboard/billing?success=1`;

    // Two line items: the flat $99/mo base fee, and the $199/memorial
    // metered price. Metered prices are NOT given a quantity here —
    // Stripe bills them based on reported usage (see
    // reportMemorialUsageToStripe in lib/memorial/createMemorial.ts),
    // so only { price: memorialPriceId } with no quantity field.
    const session = await stripe.checkout.sessions.create({
      customer:                   stripeCustomerId,
      mode:                       'subscription',
      payment_method_types:       ['card'],
      payment_method_collection:  'always',
      line_items: [
        { price: basePriceId, quantity: 1 },
        // Stripe Checkout Sessions require `quantity` on EVERY line
        // item, including metered ones — unlike creating a Subscription
        // directly via the Subscriptions API, where a metered item can
        // omit quantity entirely. This quantity:1 does NOT mean "bill
        // for 1 memorial" — it's just Checkout's required field for
        // attaching the price to the subscription. Actual billing still
        // comes entirely from meter events reported in
        // reportMemorialUsageToStripe (lib/memorial/createMemorial.ts).
        { price: memorialPriceId, quantity: 1 },
      ],
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          orgId:   org.id,
          orgSlug: org.slug,
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
      },
    });

    return NextResponse.json({ success: true, url: session.url });

  } catch (error) {
    console.error('[POST /api/billing/checkout]', error);
    return NextResponse.json({ success: false, error: 'Failed to create checkout session' }, { status: 500 });
  }
}
