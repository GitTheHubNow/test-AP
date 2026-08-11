/**
 * POST /api/billing/webhook
 *
 * Stripe webhook handler. This is the single source of truth for all
 * subscription state changes. Never update plan state anywhere else.
 *
 * Idempotency: every event is recorded in StripeEvent before processing.
 * If the same event arrives twice, it's a no-op after the first.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  (from: stripe listen --forward-to ... or Stripe Dashboard)
 *
 * To test locally:
 *   npx stripe listen --forward-to localhost:3000/api/billing/webhook
 *   npx stripe trigger checkout.session.completed
 *
 * IMPORTANT: Add to vercel.json to increase timeout for this route:
 *   "functions": { "app/api/billing/webhook/route.ts": { "maxDuration": 30 } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma }                     from '@/lib/prisma';
import { stripe, getPlanFromPriceId } from '@/lib/stripe';
import type Stripe                    from 'stripe';

// Stripe requires the raw body for signature verification.
// Next.js App Router provides it via req.text().
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook signature invalid: ${err.message}` }, { status: 400 });
  }

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing?.processed) {
    // Already handled — return 200 so Stripe stops retrying
    return NextResponse.json({ received: true, skipped: true });
  }

  // Record event (upsert handles race conditions from Stripe retries)
  await prisma.stripeEvent.upsert({
    where:  { id: event.id },
    create: { id: event.id, type: event.type, payload: event as any, processed: false },
    update: {},
  });

  // ── Event handling ─────────────────────────────────────────────────────────
  let processingError: string | null = null;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event type — not an error, just not relevant
        break;
    }
  } catch (err: any) {
    processingError = err.message ?? 'Unknown error';
    console.error(`[webhook] Failed to handle ${event.type}:`, err);
    // Don't return 500 — mark as processed with error so Stripe stops retrying
    // but log it for manual investigation
  }

  // Mark event as processed (even if errored — prevents infinite retries)
  await prisma.stripeEvent.update({
    where: { id: event.id },
    data:  { processed: true, error: processingError },
  });

  return NextResponse.json({ received: true });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return;

  const orgId = session.metadata?.orgId;
  if (!orgId) {
    console.error('[webhook] checkout.session.completed missing orgId metadata');
    return;
  }

  // Retrieve full subscription object
  const sub = await stripe.subscriptions.retrieve(session.subscription as string);
  await applySubscriptionToOrg(orgId, sub);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.orgId ?? await getOrgIdFromCustomer(sub.customer as string);
  if (!orgId) return;
  await applySubscriptionToOrg(orgId, sub);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.orgId ?? await getOrgIdFromCustomer(sub.customer as string);
  if (!orgId) return;

  await prisma.organisation.update({
    where: { id: orgId },
    data: {
      subscriptionStatus: 'CANCELED',
      stripeSubId:        null,
      stripePriceId:      null,
      currentPeriodEnd:   null,
      // Keep plan so they can see what they had — entitlement check uses CANCELED status
    },
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  // Stripe v20: invoice.subscription removed — use invoice.parent instead.
  // Only process invoices that were generated by a subscription.
  if (invoice.parent?.type !== 'subscription_details') return;
  const orgId = await getOrgIdFromCustomer(invoice.customer as string);
  if (!orgId) return;

  // Ensure status is ACTIVE after successful payment (e.g. after PAST_DUE recovery)
  await prisma.organisation.update({
    where: { id: orgId },
    data:  { subscriptionStatus: 'ACTIVE' },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Stripe v20: invoice.subscription removed — use invoice.parent instead.
  if (invoice.parent?.type !== 'subscription_details') return;
  const orgId = await getOrgIdFromCustomer(invoice.customer as string);
  if (!orgId) return;

  await prisma.organisation.update({
    where: { id: orgId },
    data:  { subscriptionStatus: 'PAST_DUE' },
  });

  // TODO: trigger email notification to org owner about payment failure
  // await sendPaymentFailedEmail(orgId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function applySubscriptionToOrg(orgId: string, sub: Stripe.Subscription) {
  const priceId  = sub.items.data[0]?.price.id;
  const plan     = priceId ? getPlanFromPriceId(priceId) : null;

  const statusMap: Record<Stripe.Subscription.Status, string> = {
    active:             'ACTIVE',
    past_due:           'PAST_DUE',
    canceled:           'CANCELED',
    incomplete:         'INCOMPLETE',
    incomplete_expired: 'INCOMPLETE',
    trialing:           'ACTIVE',   // Trial counts as active
    unpaid:             'PAST_DUE',
    paused:             'PAST_DUE',
  };

  await prisma.organisation.update({
    where: { id: orgId },
    data: {
      ...(plan ? { plan } : {}),
      stripeSubId:        sub.id,
      stripePriceId:      priceId ?? null,
      subscriptionStatus: (statusMap[sub.status] ?? 'NONE') as any,
      // Stripe v20: current_period_end moved from Subscription → SubscriptionItem
      currentPeriodEnd:   sub.items.data[0]?.current_period_end
                            ? new Date(sub.items.data[0].current_period_end * 1000)
                            : null,
      cancelAtPeriodEnd:  sub.cancel_at_period_end,
      trialEndsAt:        sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    },
  });
}

async function getOrgIdFromCustomer(stripeCustomerId: string): Promise<string | null> {
  const org = await prisma.organisation.findUnique({
    where:  { stripeCustomerId },
    select: { id: true },
  });
  return org?.id ?? null;
}
