'use client';

/**
 * app/dashboard/billing/page.tsx
 *
 * A site's billing view (manual, invoice-based billing — no card on file).
 *   GET /api/billing/status      → standing, rates, how to pay, running total
 *   GET /api/billing/usage       → which memorials are on this month's bill
 *   GET /api/billing/statements  → bills we have sent, with line items
 */

import { useEffect, useState } from 'react';

interface Status {
  accountStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  currency: string;
  trialEndsAt: string | null;
  inTrial: boolean;
  rates: { baseFeeCents: number; memorialFeeCents: number };
  paymentInstructions: string | null;
  currentPeriod: { periodKey: string; memorialCount: number; usageCents: number; baseFeeCents: number; estimatedTotalCents: number };
}
interface UsageItem { id: string; type: string; memorialTitle: string; unitPriceCents: number; note: string | null; occurredAt: string; voided: boolean }
interface Line { kind: string; description: string; amountCents: number; occurredAt?: string; note?: string | null }
interface Statement {
  id: string; number: string; periodLabel: string; status: 'SENT' | 'PAID'; totalCents: number;
  lines: Line[]; dueAt: string | null; paidAt: string | null;
}

const money = (cents: number, cur = 'AUD') => new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format(cents / 100);
const date  = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function BillingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<UsageItem[] | null>(null);
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, u, st] = await Promise.all([
          fetch('/api/billing/status').then((r) => r.json()),
          fetch('/api/billing/usage').then((r) => r.json()),
          fetch('/api/billing/statements').then((r) => r.json()),
        ]);
        if (s.success) setStatus(s.data); else setError(s.error ?? 'Failed to load billing information');
        // usage/statements are owner/admin only — other members just don't see them
        if (u.success) setItems(u.data.items);
        if (st.success) setStatements(st.data.statements);
      } catch {
        setError('Failed to load billing information');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={c.page}><p style={c.muted}>Loading billing information…</p></div>;

  const cur = status?.currency ?? 'AUD';
  const live = (items ?? []).filter((i) => !i.voided);

  return (
    <div style={c.page}>
      <h1 style={c.title}>Billing</h1>
      <p style={c.muted}>You are billed monthly by invoice. Nothing is charged automatically.</p>

      {error && <div style={c.error}>{error}</div>}

      {status?.accountStatus === 'CANCELED' && (
        <div style={c.error}>This account is suspended, so new memorials can&apos;t be created. Please contact support.</div>
      )}
      {status?.accountStatus === 'PAST_DUE' && (
        <div style={c.warn}>A statement is overdue. Please arrange payment using the details below.</div>
      )}
      {status?.inTrial && status.trialEndsAt && (
        <div style={c.info}>Your free trial runs until <strong>{date(status.trialEndsAt)}</strong>. Memorials created before then are tracked but not charged.</div>
      )}

      {status && (
        <div style={c.card}>
          <h2 style={c.h2}>Your rates</h2>
          <Row l="Platform fee (per month)" r={money(status.rates.baseFeeCents, cur)} />
          <Row l="Per memorial created" r={money(status.rates.memorialFeeCents, cur)} />
          {status.paymentInstructions && (
            <>
              <hr style={c.hr} />
              <h2 style={c.h2}>How to pay</h2>
              <p style={{ ...c.muted, whiteSpace: 'pre-wrap', color: '#334155' }}>{status.paymentInstructions}</p>
            </>
          )}
        </div>
      )}

      {status && (
        <div style={c.card}>
          <h2 style={c.h2}>This month so far</h2>
          {live.length === 0 && <p style={c.muted}>No memorials created yet this month.</p>}
          {live.map((i) => (
            <Row key={i.id} l={`${i.memorialTitle} · ${date(i.occurredAt)}${i.note ? ` · ${i.note}` : ''}`} r={money(i.unitPriceCents, cur)} />
          ))}
          <hr style={c.hr} />
          <Row l="Platform fee" r={money(status.currentPeriod.baseFeeCents, cur)} />
          <Row l={`Memorials (${status.currentPeriod.memorialCount})`} r={money(status.currentPeriod.usageCents, cur)} />
          <Row l={<strong>Running total</strong>} r={<strong>{money(status.currentPeriod.estimatedTotalCents, cur)}</strong>} />
          <p style={c.small}>Your statement is issued after the month closes; this figure is what it will be if nothing else is created.</p>
        </div>
      )}

      {statements && (
        <div style={c.card}>
          <h2 style={c.h2}>Statements</h2>
          {statements.length === 0 && <p style={c.muted}>No statements have been issued yet.</p>}
          {statements.map((s) => (
            <div key={s.id} style={{ borderTop: '1px solid #f1f5f9', padding: '0.6rem 0' }}>
              <button style={c.stmtBtn} onClick={() => setOpen(open === s.id ? null : s.id)}>
                <span><strong>{s.periodLabel}</strong> · {s.number}</span>
                <span>
                  {money(s.totalCents, cur)} ·{' '}
                  <span style={{ color: s.status === 'PAID' ? '#15803d' : '#b45309' }}>
                    {s.status === 'PAID' ? `Paid ${date(s.paidAt)}` : `Due ${date(s.dueAt)}`}
                  </span>
                </span>
              </button>
              {open === s.id && (
                <div style={{ marginTop: '0.5rem' }}>
                  {s.lines.map((l, idx) => <Row key={idx} l={l.description} r={money(l.amountCents, cur)} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ l, r }: { l: React.ReactNode; r: React.ReactNode }) {
  return <div style={c.row}><span style={{ color: '#475569' }}>{l}</span><span style={{ color: '#0f172a', whiteSpace: 'nowrap' }}>{r}</span></div>;
}

const c: Record<string, React.CSSProperties> = {
  page:    { maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui, sans-serif' },
  title:   { margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' },
  muted:   { margin: '0.25rem 0 1.25rem', fontSize: '0.875rem', color: '#64748b' },
  card:    { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1rem' },
  h2:      { margin: '0 0 0.6rem', fontSize: '1rem', fontWeight: 600, color: '#0f172a' },
  row:     { display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.35rem 0', fontSize: '0.875rem' },
  hr:      { border: 'none', borderTop: '1px solid #f1f5f9', margin: '0.6rem 0' },
  small:   { margin: '0.6rem 0 0', fontSize: '0.75rem', color: '#94a3b8' },
  error:   { background: '#fee2e2', color: '#991b1b', padding: '0.8rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' },
  warn:    { background: '#fef3c7', color: '#92400e', padding: '0.8rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' },
  info:    { background: '#eff6ff', color: '#1e40af', padding: '0.8rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' },
  stmtBtn: { display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.875rem', color: '#0f172a', textAlign: 'left' },
};
