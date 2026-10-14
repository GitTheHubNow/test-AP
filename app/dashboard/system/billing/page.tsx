'use client';

/**
 * app/dashboard/system/billing/page.tsx — platform admin only.
 *
 * Month-end billing workflow:
 *   1. Pick the month (defaults to last month).
 *   2. "Generate drafts" builds a statement per site from the usage ledger.
 *   3. Review, then Send (emails the site) → later Mark paid when the money lands.
 * Access is enforced by the /api/system/billing/* routes (403 for non-admins).
 */

import { Fragment, useEffect, useState } from 'react';

interface Site {
  organisationId: string; name: string; accountStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  trialEndsAt: string | null; billingEmail: string | null;
  customBaseFeeCents: number | null; customMemorialFeeCents: number | null;
  baseFeeCents: number; memorialFeeCents: number;
  memorialCount: number; videoCount: number; usageCents: number;
  statement: { id: string; number: string; status: 'DRAFT' | 'SENT' | 'PAID' | 'VOID'; totalCents: number } | null;
}

const money = (c: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(c / 100);

function lastMonthKey(): string {
  const d = new Date();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const toCents = (v: string): number | null => (v.trim() === '' ? null : Math.round(Number(v) * 100));

export default function SystemBillingPage() {
  const [period, setPeriod] = useState(lastMonthKey());
  const [sites, setSites] = useState<Site[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', base: '', memorial: '', status: 'ACTIVE' });

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    let alive = true;
    fetch(`/api/system/billing/usage?period=${period}`)
      .then((x) => x.json())
      .then((r) => {
        if (!alive) return;
        if (r.success) setSites(r.data.sites);
        else { setSites(null); setMsg({ ok: false, text: r.error ?? 'Failed to load' }); }
      })
      .catch(() => alive && setMsg({ ok: false, text: 'Failed to load' }));
    return () => { alive = false; };
  }, [period, reload]);

  async function call(key: string, url: string, method: string, body?: unknown, okText?: string) {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((x) => x.json());
      setMsg({ ok: !!r.success, text: r.success ? (okText ?? 'Done') : (r.error ?? 'Failed') });
      load();
    } catch { setMsg({ ok: false, text: 'Request failed' }); }
    finally { setBusy(null); }
  }

  const generate = (orgId?: string) =>
    call(orgId ?? 'all', '/api/system/billing/statements', 'POST', { period, ...(orgId ? { organisationId: orgId } : {}) }, 'Drafts generated');

  function startEdit(s: Site) {
    setEditing(s.organisationId);
    setForm({
      email: s.billingEmail ?? '',
      base: s.customBaseFeeCents === null ? '' : String(s.customBaseFeeCents / 100),
      memorial: s.customMemorialFeeCents === null ? '' : String(s.customMemorialFeeCents / 100),
      status: s.accountStatus,
    });
  }
  async function saveEdit(orgId: string) {
    await call(orgId, `/api/system/billing/orgs/${orgId}`, 'PATCH', {
      billingEmail: form.email.trim() || null,
      customBaseFeeCents: toCents(form.base),
      customMemorialFeeCents: toCents(form.memorial),
      accountStatus: form.status,
    }, 'Site settings saved');
    setEditing(null);
  }

  const total = (sites ?? []).reduce((n, s) => n + (s.statement?.totalCents ?? 0), 0);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Billing — all sites</h1>
      <div style={st.bar}>
        <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} style={st.input} />
        <button style={st.primary} disabled={busy === 'all'} onClick={() => generate()}>
          {busy === 'all' ? 'Generating…' : 'Generate drafts for all sites'}
        </button>
        <span style={st.muted}>Statements this month: {money(total)}</span>
      </div>
      {msg && <div style={{ ...st.msg, background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#991b1b' }}>{msg.text}</div>}

      <table style={st.table}>
        <thead><tr>{['Site', 'Memorials', 'Usage', 'Statement', 'Actions'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
        <tbody>
          {(sites ?? []).map((s) => (
            <Fragment key={s.organisationId}>
              <tr>
                <td style={st.td}>
                  <strong>{s.name}</strong>
                  {s.accountStatus !== 'ACTIVE' && <span style={st.tag}>{s.accountStatus === 'CANCELED' ? 'SUSPENDED' : 'OVERDUE'}</span>}
                  <div style={st.muted}>{s.billingEmail ?? 'emails the owners'}</div>
                </td>
                <td style={st.td}>{s.memorialCount}</td>
                <td style={st.td}>{money(s.usageCents)}</td>
                <td style={st.td}>{s.statement ? <>{s.statement.number}<div style={st.muted}>{s.statement.status} · {money(s.statement.totalCents)}</div></> : '—'}</td>
                <td style={st.td}>
                  <button style={st.btn} onClick={() => generate(s.organisationId)} disabled={busy === s.organisationId || s.statement?.status === 'SENT' || s.statement?.status === 'PAID'}>Generate</button>
                  {s.statement && (s.statement.status === 'DRAFT' || s.statement.status === 'SENT') && (
                    <button style={st.btn} disabled={busy === s.statement.id}
                      onClick={() => call(s.statement!.id, `/api/system/billing/statements/${s.statement!.id}/send`, 'POST', { resend: s.statement!.status === 'SENT' }, 'Statement emailed')}>
                      {s.statement.status === 'SENT' ? 'Resend' : 'Send'}
                    </button>
                  )}
                  {s.statement?.status === 'SENT' && (
                    <button style={st.btn} onClick={() => {
                      const ref = window.prompt('Payment reference (optional):') ;
                      if (ref !== null) call(s.statement!.id, `/api/system/billing/statements/${s.statement!.id}`, 'PATCH', { action: 'mark_paid', paymentReference: ref }, 'Marked paid');
                    }}>Mark paid</button>
                  )}
                  {s.statement && s.statement.status !== 'PAID' && s.statement.status !== 'VOID' && (
                    <button style={st.btn} onClick={() => window.confirm('Void this statement? Its usage will be released so it can be regenerated.') && call(s.statement!.id, `/api/system/billing/statements/${s.statement!.id}`, 'PATCH', { action: 'void' }, 'Statement voided')}>Void</button>
                  )}
                  <button style={st.btn} onClick={() => (editing === s.organisationId ? setEditing(null) : startEdit(s))}>Settings</button>
                </td>
              </tr>
              {editing === s.organisationId && (
                <tr><td colSpan={5} style={{ ...st.td, background: '#f8fafc' }}>
                  <label style={st.lbl}>Billing email<input style={st.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="blank = owners" /></label>
                  <label style={st.lbl}>Monthly fee ($)<input style={st.input} value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} placeholder={`default ${money(s.baseFeeCents)}`} /></label>
                  <label style={st.lbl}>Per memorial ($)<input style={st.input} value={form.memorial} onChange={(e) => setForm({ ...form, memorial: e.target.value })} placeholder={`default ${money(s.memorialFeeCents)}`} /></label>
                  <label style={st.lbl}>Account
                    <select style={st.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="ACTIVE">Active</option><option value="PAST_DUE">Overdue (still allowed)</option><option value="CANCELED">Suspended</option>
                    </select>
                  </label>
                  <button style={st.primary} onClick={() => saveEdit(s.organisationId)}>Save</button>
                  <p style={st.muted}>New rates apply to memorials created from now on; existing records keep the price they were recorded at.</p>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui, sans-serif' },
  h1: { margin: '0 0 1rem', fontSize: '1.5rem', color: '#0f172a' },
  bar: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' },
  input: { padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem', marginLeft: 6 },
  primary: { padding: '0.5rem 0.9rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' },
  btn: { padding: '0.3rem 0.6rem', marginRight: 6, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem' },
  muted: { fontSize: '0.75rem', color: '#64748b', marginTop: 2 },
  msg: { padding: '0.7rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.85rem' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0' },
  th: { textAlign: 'left', padding: '0.6rem', fontSize: '0.75rem', color: '#64748b', borderBottom: '1px solid #e2e8f0' },
  td: { padding: '0.6rem', fontSize: '0.85rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  tag: { marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: '0.65rem' },
  lbl: { display: 'inline-block', marginRight: 14, fontSize: '0.75rem', color: '#475569' },
};
