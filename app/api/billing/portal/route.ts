/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session so the customer can:
 *   - Update payment method
 *   - View invoice history
 *   - Cancel or change subscription
 *
 * Returns: { url: string }
 * Client should redirect to this URL immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { stripe }                     from '@/lib/stripe';
import { getOrgForUser }              from '@/lib/tenant';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const org = await getOrgForUser(userId);

    if (!org.stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 404 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   org.stripeCustomerId,
      return_url: `${APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({ success: true, url: session.url });

  } catch (error) {
    console.error('[POST /api/billing/portal]', error);
    return NextResponse.json({ success: false, error: 'Failed to open billing portal' }, { status: 500 });
  }
}
