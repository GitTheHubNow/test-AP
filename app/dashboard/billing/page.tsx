'use client';

/**
 * app/dashboard/billing/page.tsx
 *
 * Shows current plan, usage bars, upgrade/manage buttons.
 * Reads from GET /api/billing/status.
 * Upgrade → POST /api/billing/checkout → redirect to Stripe.
 * Manage → POST /api/billing/portal → redirect to Stripe portal.
 */

import { useEffect, useState } from 'react';
import { useRouter }           from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
type SubStatus = 'NONE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';

interface BillingStatus {
  plan:               Plan;
  planDisplay:        { name: string; priceAud: number; description: string };
  subscriptionStatus: SubStatus;
  currentPeriodEnd:   string | null;
  cancelAtPeriodEnd:  boolean;
  trialEndsAt:        string | null;
  usage: {
    memorialsThisMonth: number;
    videosThisMonth:    number;
    memorialLimit:      number;
    videoLimit:         number;
  };
  features: {
    guestBook:      boolean;
    analytics:      boolean;
    customBranding: boolean;
    apiAccess:      boolean;
  };
}

// ── Plan cards config ─────────────────────────────────────────────────────────

const PLANS: { plan: Plan; name: string; price: number; description: string; features: string[] }[] = [
  {
    plan:        'STARTER',
    name:        'Starter',
    price:       49,
    description: 'For individual funeral directors',
    features: [
      '10 memorials per month',
      '3 tribute videos per month',
      'Basic QR codes',
      '1 team seat',
      '200 MB storage per memorial',
    ],
  },
  {
    plan:        'PROFESSIONAL',
    name:        'Professional',
    price:       99,
    description: 'For busy funeral homes',
    features: [
      'Unlimited memorials',
      'Unlimited tribute videos',
      'Guest book',
      'Analytics dashboard',
      '3 team seats',
      '1 GB storage per memorial',
    ],
  },
  {
    plan:        'ENTERPRISE',
    name:        'Enterprise',
    price:       249,
    description: 'For multi-location groups',
    features: [
      'Everything in Professional',
      'Custom branding & domain',
      'API access',
      'Unlimited team seats',
      '5 GB storage per memorial',
      'Priority support',
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function usagePercent(used: number, limit: number): number {
  if (limit === -1) return 0; // unlimited
  if (limit === 0)  return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

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
    default:           return { label: 'Free tier',  color: '#475569', bg: '#f1f5f9' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter();
  const [status,    setStatus]    = useState<BillingStatus | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [upgrading, setUpgrading] = useState<Plan | null>(null);
  const [managing,  setManaging]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => { if (d.success) setStatus(d.data); })
      .catch(() => setError('Failed to load billing information'))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(plan: Plan) {
    setUpgrading(plan);
    setError(null);
    try {
      const res  = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      window.location.href = data.url;
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setUpgrading(null);
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

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Billing</h1>
          <p style={s.subtitle}>Manage your plan and usage</p>
        </div>
        {status?.subscriptionStatus === 'ACTIVE' || status?.subscriptionStatus === 'PAST_DUE' ? (
          <button
            style={{ ...s.btnSecondary, opacity: managing ? 0.6 : 1 }}
            onClick={handleManage}
            disabled={managing}
          >
            {managing ? 'Opening…' : 'Manage subscription'}
          </button>
        ) : null}
      </div>

      {/* Error */}
      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Trial banner */}
      {status?.trialEndsAt && new Date(status.trialEndsAt) > new Date() && (
        <div style={s.trialBanner}>
          <span style={s.trialIcon}>🎉</span>
          <span>Your 14-day free trial ends on <strong>{formatDate(status.trialEndsAt)}</strong>. No charge until then.</span>
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

      {/* Current plan card */}
      {status && (
        <div style={s.currentPlanCard}>
          <div style={s.currentPlanLeft}>
            <div style={s.currentPlanHeader}>
              <span style={s.currentPlanName}>{status.planDisplay.name}</span>
              <span style={{ ...s.statusBadge, color: badge.color, background: badge.bg }}>
                {badge.label}
              </span>
            </div>
            <p style={s.currentPlanDesc}>{status.planDisplay.description}</p>
            {status.currentPeriodEnd && (
              <p style={s.renewalText}>
                {status.cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(status.currentPeriodEnd)}`
                  : `Renews ${formatDate(status.currentPeriodEnd)}`
                }
              </p>
            )}
          </div>
          <div style={s.currentPlanPrice}>
            <span style={s.priceAmount}>${status.planDisplay.priceAud}</span>
            <span style={s.priceFreq}>/month</span>
          </div>
        </div>
      )}

      {/* Usage */}
      {status && (
        <div style={s.usageCard}>
          <h2 style={s.sectionTitle}>This month's usage</h2>
          <div style={s.usageGrid}>
            <UsageBar
              label="Memorials"
              used={status.usage.memorialsThisMonth}
              limit={status.usage.memorialLimit}
            />
            <UsageBar
              label="Tribute videos"
              used={status.usage.videosThisMonth}
              limit={status.usage.videoLimit}
            />
          </div>
          <p style={s.usageResetNote}>Counters reset on the 1st of each month.</p>
        </div>
      )}

      {/* Features */}
      {status && (
        <div style={s.featuresCard}>
          <h2 style={s.sectionTitle}>Features on your plan</h2>
          <div style={s.featureGrid}>
            {([
              { label: 'Guest book',      enabled: status.features.guestBook      },
              { label: 'Analytics',       enabled: status.features.analytics      },
              { label: 'Custom branding', enabled: status.features.customBranding },
              { label: 'API access',      enabled: status.features.apiAccess      },
            ] as const).map(({ label, enabled }) => (
              <div key={label} style={s.featureRow}>
                <span style={{ ...s.featureIcon, color: enabled ? '#15803d' : '#94a3b8' }}>
                  {enabled ? '✓' : '—'}
                </span>
                <span style={{ ...s.featureLabel, color: enabled ? '#1e293b' : '#94a3b8' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan selection */}
      <div style={s.plansSection}>
        <h2 style={s.sectionTitle}>
          {status?.subscriptionStatus === 'ACTIVE' ? 'Change plan' : 'Choose a plan'}
        </h2>
        <div style={s.plansGrid}>
          {PLANS.map(plan => {
            const isCurrent  = status?.plan === plan.plan;
            const isPopular  = plan.plan === 'PROFESSIONAL';
            const isUpgrading = upgrading === plan.plan;

            return (
              <div
                key={plan.plan}
                style={{
                  ...s.planCard,
                  ...(isCurrent  ? s.planCardCurrent  : {}),
                  ...(isPopular && !isCurrent ? s.planCardPopular : {}),
                }}
              >
                {isPopular && !isCurrent && (
                  <div style={s.popularBadge}>Most popular</div>
                )}
                {isCurrent && (
                  <div style={s.currentBadge}>Current plan</div>
                )}
                <div style={s.planName}>{plan.name}</div>
                <div style={s.planPrice}>
                  <span style={s.planPriceAmount}>${plan.price}</span>
                  <span style={s.planPriceFreq}>/mo</span>
                </div>
                <p style={s.planDesc}>{plan.description}</p>
                <ul style={s.featureList}>
                  {plan.features.map(f => (
                    <li key={f} style={s.featureItem}>
                      <span style={s.featureCheck}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  style={{
                    ...s.planBtn,
                    ...(isCurrent   ? s.planBtnCurrent  : {}),
                    ...(isPopular && !isCurrent ? s.planBtnPopular : {}),
                    opacity: (isCurrent || isUpgrading) ? 0.6 : 1,
                  }}
                  onClick={() => !isCurrent && handleUpgrade(plan.plan)}
                  disabled={isCurrent || !!upgrading}
                >
                  {isUpgrading
                    ? 'Redirecting…'
                    : isCurrent
                    ? 'Current plan'
                    : status?.subscriptionStatus === 'ACTIVE'
                    ? 'Switch to this plan'
                    : 'Start 14-day trial'
                  }
                </button>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── UsageBar sub-component ────────────────────────────────────────────────────

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct       = unlimited ? 0 : usagePercent(used, limit);
  const nearLimit = !unlimited && pct >= 80;
  const atLimit   = !unlimited && pct >= 100;

  return (
    <div style={s.usageBarWrap}>
      <div style={s.usageBarHeader}>
        <span style={s.usageBarLabel}>{label}</span>
        <span style={{ ...s.usageBarCount, color: atLimit ? '#dc2626' : nearLimit ? '#b45309' : '#475569' }}>
          {unlimited ? `${used} / unlimited` : `${used} / ${limit}`}
        </span>
      </div>
      {!unlimited && (
        <div style={s.usageTrack}>
          <div style={{
            ...s.usageFill,
            width:      `${pct}%`,
            background: atLimit ? '#dc2626' : nearLimit ? '#f59e0b' : '#2563eb',
          }} />
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:            { maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui, sans-serif' },
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
  currentPlanCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  currentPlanLeft: { flex: 1 },
  currentPlanHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' },
  currentPlanName: { fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' },
  statusBadge:     { fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.625rem', borderRadius: 999 },
  currentPlanDesc: { margin: '0 0 0.25rem', fontSize: '0.875rem', color: '#64748b' },
  renewalText:     { margin: 0, fontSize: '0.8rem', color: '#94a3b8' },
  currentPlanPrice: { textAlign: 'right' as const },
  priceAmount:     { fontSize: '2rem', fontWeight: 800, color: '#0f172a' },
  priceFreq:       { fontSize: '0.875rem', color: '#64748b' },
  usageCard:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem' },
  usageGrid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '1rem 0 0.5rem' },
  usageResetNote:  { margin: 0, fontSize: '0.75rem', color: '#94a3b8' },
  usageBarWrap:    { display: 'flex', flexDirection: 'column' as const, gap: '0.375rem' },
  usageBarHeader:  { display: 'flex', justifyContent: 'space-between' },
  usageBarLabel:   { fontSize: '0.875rem', fontWeight: 500, color: '#1e293b' },
  usageBarCount:   { fontSize: '0.875rem' },
  usageTrack:      { height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' },
  usageFill:       { height: '100%', borderRadius: 999, transition: 'width 0.3s ease' },
  featuresCard:    { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' },
  featureGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' },
  featureRow:      { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  featureIcon:     { fontSize: '0.875rem', fontWeight: 700, width: 16 },
  featureLabel:    { fontSize: '0.875rem' },
  sectionTitle:    { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: '#0f172a' },
  plansSection:    { marginTop: '0.5rem' },
  plansGrid:       { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' },
  planCard:        { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.5rem', position: 'relative' as const, display: 'flex', flexDirection: 'column' as const },
  planCardCurrent: { border: '2px solid #2563eb', background: '#eff6ff' },
  planCardPopular: { border: '2px solid #0f172a' },
  popularBadge:    { position: 'absolute' as const, top: -12, left: '50%', transform: 'translateX(-50%)', background: '#0f172a', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: 999, whiteSpace: 'nowrap' as const },
  currentBadge:    { position: 'absolute' as const, top: -12, left: '50%', transform: 'translateX(-50%)', background: '#2563eb', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: 999, whiteSpace: 'nowrap' as const },
  planName:        { fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' },
  planPrice:       { marginBottom: '0.5rem' },
  planPriceAmount: { fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' },
  planPriceFreq:   { fontSize: '0.875rem', color: '#64748b' },
  planDesc:        { fontSize: '0.8rem', color: '#64748b', margin: '0 0 1rem', lineHeight: 1.4 },
  featureList:     { listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '0.375rem' },
  featureItem:     { fontSize: '0.8rem', color: '#475569', display: 'flex', gap: '0.375rem' },
  featureCheck:    { color: '#15803d', fontWeight: 700, flexShrink: 0 },
  planBtn:         { width: '100%', padding: '0.625rem', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', marginTop: 'auto' as const },
  planBtnCurrent:  { background: '#eff6ff', borderColor: '#2563eb', color: '#2563eb', cursor: 'default' },
  planBtnPopular:  { background: '#0f172a', borderColor: '#0f172a', color: '#fff' },
  btnSecondary:    { background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' },
};
