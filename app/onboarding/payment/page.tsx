'use client';

/**
 * app/onboarding/payment/page.tsx
 *
 * Part D — Step 2 of the guided onboarding flow: mandatory payment method.
 *
 * Reuses the existing, already-verified /api/billing/checkout route
 * (Stripe Checkout, trial length pulled from PlatformSettings) rather
 * than building a second checkout path. The only change made to that
 * route as part of Part D is adding payment_method_collection: 'always',
 * which was missing — without it, Stripe does not actually collect a
 * card up front for a trialing subscription, contradicting the
 * documented requirement.
 *
 * The org was already created in step 1 (app/onboarding/page.tsx →
 * /api/onboarding/create-org), so calling /api/billing/checkout here is
 * safe — it resolves an org that now genuinely exists rather than
 * risking the auto-create race.
 *
 * success_url on the checkout session points back through
 * /dashboard?onboarded=1 so the dashboard can show the one-time
 * "invite your team" nudge.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingSteps } from '@/components/onboarding/OnboardingSteps';

const DEFAULT_PLAN = 'STARTER';

export default function OnboardingPaymentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddPayment() {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: DEFAULT_PLAN, onboarding: true }),
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.url) {
        setError(data.error || 'Could not start checkout. Please try again.');
        setIsSubmitting(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError('Could not start checkout. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#4f5d75', fontFamily: 'Georgia, serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        <OnboardingSteps current={2} />

        <div style={{
          background: '#3f4c61', border: '1px solid #5c6a80', borderRadius: 14,
          padding: '2.5rem 2.25rem',
        }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#cdba93' }}>
            Step 2 of 2
          </p>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 300, color: '#f4f1ea' }}>
            Add a payment method
          </h1>
          <p style={{ margin: '0 0 1.75rem', fontSize: '0.85rem', color: '#8a8aaa', lineHeight: 1.5 }}>
            You won't be charged today. Your trial starts now, and your card
            is only charged if you choose to continue afterwards.
          </p>

          {error && (
            <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#e0876a' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleAddPayment}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '0.8rem', borderRadius: 8,
              background: isSubmitting ? 'rgba(201,169,110,0.2)' : 'rgba(201,169,110,0.15)',
              border: '1px solid rgba(201,169,110,0.4)',
              color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '0.9rem',
              letterSpacing: '0.03em', cursor: isSubmitting ? 'default' : 'pointer',
            }}
          >
            {isSubmitting ? 'Redirecting…' : 'Continue to secure checkout'}
          </button>

          <p style={{ margin: '1rem 0 0', fontSize: '0.7rem', color: '#8290a3', textAlign: 'center' }}>
            Handled securely by Stripe. Absolute Posterity never sees your card details.
          </p>
        </div>
      </div>
    </div>
  );
}

