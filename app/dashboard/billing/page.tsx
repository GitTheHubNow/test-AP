'use client';

/**
 * app/dashboard/billing/page.tsx
 *
 * CHANGED — was a 3-tier plan-comparison page (Starter/Professional/
 * Enterprise cards, feature checkmarks, usage-limit bars, "switch plan"
 * buttons). Under the new base + per-memorial-metered pricing model
 * there's one plan for everyone, so all of that is gone. Replaced with:
 * subscription status, this month's running total, and the manage/
 * cancel button (unchanged — still goes through the Stripe portal).
 *
 * Reads from GET /api/billing/status.
 * Start subscription → POST /api/billing/checkout → redirect to Stripe.
 * Manage → POST /api/billing/portal → redirect to Stripe portal.
 */

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';

interface BillingStatus {
  subscriptionStatus: SubStatus;
  currentPeriodEnd:   string | null;
  cancelAtPeriodEnd:  boolean;
  trialEndsAt:        string | null;
  billing: {
    baseFeeAud:     number;
    perMemorialAud: number;
  };
  usage: {
    memorialsThisMonth:         number;
    videosThisMonth:            number;
    estimatedMemorialChargeAud: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status: SubStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'ACTIVE':     return { label: 'Active',     color: '#15803d', bg: '#dcfce7' };
    case 'PAST_DUE':   return { label: 'Past due',   color: '#b45309', bg: '#fef3c7' };
    case 'CANCELED':   return { label: 'Cancelled',  color: '#dc2626', bg: '#fee2e2' };
    case 'INCOMPLETE': return { label: 'Incomplete', color: '#7c3aed', bg: '#ede9fe' };
    default:           return { label: 'No subscription', color: '#475569', bg: '#f1f5f9' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [status,    setStatus]    = useState<BillingStatus | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [starting,  setStarting]  = useState(false);
  const [managing,  setManaging]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => { if (d.success) setStatus(d.data); })
      .catch(() => setError('Failed to load billing information'))
      .finally(() => setLoading(false));
  }, []);

  async function handleStartSubscription() {
    setStarting(true);
    setError(null);
    try {
      const res  = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      window.location.href = data.url;
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setStarting(false);
    }
  }

  async function handleManage() {
    setManaging(true);
    setError(null);
    try {
      const res  = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      window.location.href = data.url;
    } catch {
      setError('Failed to open billing portal. Please try again.');
    } finally {
      setManaging(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.loadingWrap}>
          <div style={s.spinner} />
          <p style={s.loadingText}>Loading billing information…</p>
        </div>
      </div>
    );
  }

  const badge = statusBadge(status?.subscriptionStatus ?? 'NONE');
  const hasSubscription = status?.subscriptionStatus === 'ACTIVE' || status?.subscriptionStatus === 'PAST_DUE';

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Billing</h1>
          <p style={s.subtitle}>Manage your subscription and usage</p>
        </div>
        {hasSubscription && (
          <button
            style={{ ...s.btnSecondary, opacity: managing ? 0.6 : 1 }}
            onClick={handleManage}
            disabled={managing}
          >
            {managing ? 'Opening…' : 'Manage subscription'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Trial banner */}
      {status?.trialEndsAt && new Date(status.trialEndsAt) > new Date() && (
        <div style={s.trialBanner}>
          <span style={s.trialIcon}>🎉</span>
          <span>Your free trial ends on <strong>{formatDate(status.trialEndsAt)}</strong>. No charge until then.</span>
        </div>
      )}

      {/* Past due warning */}
      {status?.subscriptionStatus === 'PAST_DUE' && (
        <div style={s.warningBanner}>
          <span style={s.warningIcon}>⚠️</span>
          <span>
            Your last payment failed. Please{' '}
            <button style={s.inlineLink} onClick={handleManage}>update your payment method</button>
            {' '}to avoid service interruption.
          </span>
        </div>
      )}

      {/* No subscription yet — prompt to start */}
      {!hasSubscription && status?.subscriptionStatus !== 'INCOMPLETE' && (
        <div style={s.startCard}>
          <h2 style={s.sectionTitle}>Start your subscription</h2>
          <p style={s.startDesc}>{`\$${status?.billing.baseFeeAud ?? 99}/month base fee, plus \$${status?.billing.perMemorialAud ?? 199} per memorial you create. No charge until your trial ends.`}</p>
          <button
            style={{ ...s.startBtn, opacity: starting ? 0.6 : 1 }}
            onClick={handleStartSubscription}
            disabled={starting}
          >
            {starting ? 'Redirecting…' : 'Add payment method'}
          </button>
        </div>
      )}

      {/* Current subscription card */}
      {status && hasSubscription && (
        <div style={s.currentPlanCard}>
          <div style={s.currentPlanLeft}>
            <div style={s.currentPlanHeader}>
              <span style={s.currentPlanName}>Absolute Posterity subscription</span>
              <span style={{ ...s.statusBadge, color: badge.color, background: badge.bg }}>
                {badge.label}
              </span>
            </div>
            <p style={s.currentPlanDesc}>
              ${status.billing.baseFeeAud}/month base fee, plus ${status.billing.perMemorialAud} per memorial
            </p>
            {status.currentPeriodEnd && (
              <p style={s.renewalText}>
                {status.cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(status.currentPeriodEnd)}`
                  : `Renews ${formatDate(status.currentPeriodEnd)}`
                }
              </p>
            )}
          </div>
        </div>
      )}

      {/* This month's usage + running total */}
      {status && hasSubscription && (
        <div style={s.usageCard}>
          <h2 style={s.sectionTitle}>This month</h2>
          <div style={s.usageRow}>
            <span style={s.usageRowLabel}>Memorials created</span>
            <span style={s.usageRowValue}>{status.usage.memorialsThisMonth}</span>
          </div>
          <div style={s.usageRow}>
            <span style={s.usageRowLabel}>Tribute videos created</span>
            <span style={s.usageRowValue}>{status.usage.videosThisMonth}</span>
          </div>
          <div style={s.usageDivider} />
          <div style={s.usageRow}>
            <span style={s.usageRowLabelTotal}>Base fee</span>
            <span style={s.usageRowValueTotal}>${status.billing.baseFeeAud}</span>
          </div>
          <div style={s.usageRow}>
            <span style={s.usageRowLabelTotal}>
              Memorials ({status.usage.memorialsThisMonth} × ${status.billing.perMemorialAud})
            </span>
            <span style={s.usageRowValueTotal}>${status.usage.estimatedMemorialChargeAud}</span>
          </div>
          <div style={s.usageDivider} />
          <div style={s.usageRow}>
            <span style={s.usageRowLabelGrand}>Estimated total this cycle</span>
            <span style={s.usageRowValueGrand}>
              ${status.billing.baseFeeAud + status.usage.estimatedMemorialChargeAud}
            </span>
          </div>
          <p style={s.usageResetNote}>
            Counters reset each billing cycle. This is an estimate — see the Stripe billing
            portal for your actual invoice.
          </p>
        </div>
      )}

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:            { maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui, sans-serif' },
  header:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title:           { margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' },
  subtitle:        { margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' },
  loadingWrap:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem', gap: '1rem' },
  spinner:         { width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  loadingText:     { color: '#64748b', fontSize: '0.875rem' },
  errorBanner:     { background: '#fee2e2', color: '#991b1b', padding: '0.875rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' },
  trialBanner:     { background: '#eff6ff', color: '#1e40af', padding: '0.875rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' },
  trialIcon:       { fontSize: '1rem' },
  warningBanner:   { background: '#fef3c7', color: '#92400e', padding: '0.875rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' },
  warningIcon:     { fontSize: '1rem' },
  inlineLink:      { background: 'none', border: 'none', color: '#92400e', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' },
  startCard:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '2rem', marginBottom: '1rem', textAlign: 'center' as const },
  startDesc:       { margin: '0.5rem 0 1.25rem', fontSize: '0.9rem', color: '#64748b' },
  startBtn:        { padding: '0.75rem 1.5rem', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' },
  currentPlanCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem' },
  currentPlanLeft: { flex: 1 },
  currentPlanHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' },
  currentPlanName: { fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' },
  statusBadge:     { fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.625rem', borderRadius: 999 },
  currentPlanDesc: { margin: '0 0 0.25rem', fontSize: '0.875rem', color: '#64748b' },
  renewalText:     { margin: 0, fontSize: '0.8rem', color: '#94a3b8' },
  usageCard:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem' },
  sectionTitle:    { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#0f172a' },
  usageRow:        { display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.875rem' },
  usageRowLabel:   { color: '#475569' },
  usageRowValue:   { color: '#0f172a', fontWeight: 600 },
  usageRowLabelTotal: { color: '#64748b' },
  usageRowValueTotal: { color: '#334155' },
  usageRowLabelGrand: { color: '#0f172a', fontWeight: 700 },
  usageRowValueGrand: { color: '#0f172a', fontWeight: 800, fontSize: '1.1rem' },
  usageDivider:    { height: 1, background: '#f1f5f9', margin: '0.5rem 0' },
  usageResetNote:  { margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#94a3b8' },
  btnSecondary:    { background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' },
};
