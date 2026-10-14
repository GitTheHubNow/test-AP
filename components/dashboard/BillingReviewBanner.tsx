// components/dashboard/BillingReviewBanner.tsx
//
// Server component, rendered by app/dashboard/layout.tsx for PLATFORM
// ADMINS ONLY. Shows when last month's bills are drafted and waiting, or
// when sent bills are overdue. It needs no dismiss button: it vanishes on
// its own once every draft has been sent.

import Link from 'next/link';
import { getReviewSummary } from '@/lib/billing/adminSummary';
import { formatMoney } from '@/lib/billing/pricing';

export async function BillingReviewBanner() {
  let s;
  try { s = await getReviewSummary(); }
  catch (err) { console.error('[BillingReviewBanner]', err); return null; } // never break the dashboard over a banner

  if (s.draftCount === 0 && s.overdueCount === 0) return null;

  return (
    <div style={{
      margin: '1rem 2.5rem 0', maxWidth: 900,
      background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.45)',
      borderRadius: 10, padding: '1rem 1.4rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
    }}>
      <div>
        {s.draftCount > 0 && (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#f4f1ea' }}>
            <strong>{s.periodLabel} bills are ready:</strong> {s.draftCount} statement{s.draftCount === 1 ? '' : 's'} · {formatMoney(s.draftCents)}. Not sent yet.
          </p>
        )}
        {s.overdueCount > 0 && (
          <p style={{ margin: s.draftCount > 0 ? '0.3rem 0 0' : 0, fontSize: '0.8rem', color: '#e8c17a' }}>
            {s.overdueCount} sent statement{s.overdueCount === 1 ? ' is' : 's are'} overdue ({formatMoney(s.overdueCents)}).
          </p>
        )}
      </div>
      <Link href="/dashboard/system/billing" style={{
        padding: '0.55rem 1.1rem', borderRadius: 6, whiteSpace: 'nowrap', textDecoration: 'none', fontSize: '0.8rem',
        background: 'rgba(201,169,110,0.2)', border: '1px solid rgba(201,169,110,0.5)', color: '#cdba93',
      }}>
        Review &amp; send
      </Link>
    </div>
  );
}
