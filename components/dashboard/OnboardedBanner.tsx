'use client';

/**
 * components/dashboard/OnboardedBanner.tsx
 *
 * Part D — shown once on first dashboard arrival after completing
 * onboarding (org named + payment method added), driven by the
 * ?onboarded=1 query param set in the checkout session's success_url
 * (see app/api/billing/checkout/route.ts).
 *
 * "One-time" here means: shown for this single page load only. It does
 * not persist dismissal server-side — reloading /dashboard without the
 * query param (which is what happens on any subsequent visit, since
 * nothing preserves it) simply won't show it again. No extra schema
 * field or client storage needed for that guarantee.
 */

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function OnboardedBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get('onboarded') === '1') {
      setVisible(true);
      // Strip the query param so a refresh doesn't re-show the banner.
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  if (!visible) return null;

  return (
    <div style={{
      margin: '0 2.5rem 1.5rem',
      maxWidth: 900,
      background: 'rgba(201,169,110,0.08)',
      border: '1px solid rgba(201,169,110,0.3)',
      borderRadius: 10,
      padding: '1.1rem 1.4rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
    }}>
      <div>
        <p style={{ margin: '0 0 0.2rem', fontSize: '0.85rem', color: '#f5f0e8' }}>
          You're all set up.
        </p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#8a8aaa' }}>
          Working with a team? Invite colleagues to help manage memorials.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <Link
          href="/dashboard/org/settings"
          style={{
            padding: '0.5rem 1rem', borderRadius: 6,
            background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.4)',
            color: '#c9a96e', fontSize: '0.78rem', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          Invite your team
        </Link>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'none', border: 'none', color: '#5a5870',
            fontSize: '0.9rem', cursor: 'pointer', padding: '0.25rem',
          }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
