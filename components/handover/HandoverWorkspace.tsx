'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────

interface Memorial {
  id:            string;
  title:         string;
  workflowStage: string;
  funeralDate:   string | null;
}

interface Handover {
  id:                   string;
  status:               string;
  familyContactName:    string;
  familyContactEmail:   string;
  familyContactPhone:   string | null;
  scheduledAt:          string | null;
  completedAt:          string | null;
  cancelledAt:          string | null;
  cancelReason:         string | null;
  acceptUrl:            string | null;
  acceptTokenExpiresAt: string | null;
  notificationSentAt:   string | null;
  createdAt:            string;
  familyAccessToken:    string | null;
  familyAccessEnabled:  boolean;
}

interface Props {
  memorial: Memorial;
  handover: Handover | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:   { label: 'Pending',   color: '#92400E', bg: '#FEF3C7' },
    SCHEDULED: { label: 'Scheduled', color: '#1E40AF', bg: '#DBEAFE' },
    COMPLETED: { label: 'Completed', color: '#065F46', bg: '#D1FAE5' },
    CANCELLED: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.2rem 0.75rem', borderRadius: 999,
      fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: c.color, background: c.bg, fontFamily: 'var(--font-body)',
    }}>
      {c.label}
    </span>
  );
}

// ── Handover Form ──────────────────────────────────────────────────────────

function HandoverForm({ memorialId, funeralDate, existing, onSaved }: {
  memorialId:  string;
  funeralDate: string | null;
  existing:    Handover | null;
  onSaved:     (h: Handover) => void;
}) {
  const [name,        setName]        = useState(existing?.familyContactName  ?? '');
  const [email,       setEmail]       = useState(existing?.familyContactEmail ?? '');
  const [phone,       setPhone]       = useState(existing?.familyContactPhone ?? '');
  const [timing,      setTiming]      = useState<'immediate' | 'scheduled' | 'manual'>(
    existing?.scheduledAt ? 'scheduled' : 'manual'
  );
  const [schedDate,   setSchedDate]   = useState(
    existing?.scheduledAt ? existing.scheduledAt.split('T')[0] : ''
  );
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Suggest 7 days after funeral if known
  const suggestedDate = funeralDate
    ? new Date(new Date(funeralDate).getTime() + 7 * 86400000).toISOString().split('T')[0]
    : '';

  async function handleSave() {
    if (!name.trim())  { setError('Family contact name is required.'); return; }
    if (!email.trim()) { setError('Family contact email is required.'); return; }

    let scheduledAt: string | null = null;
    if (timing === 'immediate') {
      // Immediate = schedule for 1 minute from now
      scheduledAt = new Date(Date.now() + 60000).toISOString();
    } else if (timing === 'scheduled') {
      if (!schedDate) { setError('Please select a date for the handover.'); return; }
      scheduledAt = new Date(schedDate).toISOString();
    }

    setError(null);
    setSaving(true);

    try {
      const res  = await fetch(`/api/memorial/${memorialId}/handover`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          familyContactName:  name.trim(),
          familyContactEmail: email.trim(),
          familyContactPhone: phone.trim() || undefined,
          scheduledAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      onSaved(data.data.handover);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.6rem 0.85rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
    border: '1px solid var(--ivory-mid)', borderRadius: 7,
    background: '#fff', color: 'var(--ink)', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Family contact */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="field-label">Contact name *</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah Johnson" />
        </div>
        <div>
          <label className="field-label">Contact email *</label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@example.com" />
        </div>
      </div>

      <div>
        <label className="field-label">Contact phone (optional)</label>
        <input style={{ ...inputStyle, maxWidth: 280 }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+61 4xx xxx xxx" />
      </div>

      {/* Timing */}
      <div>
        <label className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>When to transfer ownership</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { key: 'manual',    label: 'Manual — I will send the accept link myself' },
            { key: 'scheduled', label: 'Scheduled — transfer on a specific date' },
            { key: 'immediate', label: 'Immediate — transfer now (family must accept via link)' },
          ].map(opt => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'var(--font-body)', color: 'var(--ink)' }}>
              <input
                type="radio"
                name="timing"
                value={opt.key}
                checked={timing === opt.key}
                onChange={() => setTiming(opt.key as typeof timing)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {timing === 'scheduled' && (
          <div style={{ marginTop: '0.75rem', paddingLeft: '1.5rem' }}>
            <label className="field-label">Handover date *</label>
            <input
              style={{ ...inputStyle, maxWidth: 240 }}
              type="date"
              value={schedDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setSchedDate(e.target.value)}
            />
            {suggestedDate && (
              <button
                onClick={() => setSchedDate(suggestedDate)}
                style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--gold)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                Use suggested: 7 days after funeral ({suggestedDate})
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p style={{ fontSize: '0.82rem', color: '#991B1B', fontFamily: 'var(--font-body)', background: '#FEE2E2', padding: '0.65rem 0.9rem', borderRadius: 8 }}>
          {error}
        </p>
      )}

      <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : existing ? 'Update Handover' : 'Configure Handover'}
      </button>
    </div>
  );
}

// ── Configured State ───────────────────────────────────────────────────────

function HandoverConfigured({ memorialId, handover, onCancel, onCopy }: {
  memorialId: string;
  handover:   Handover;
  onCancel:   () => void;
  onCopy:     (url: string) => void;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [accessMsg,      setAccessMsg]      = useState<string | null>(null);
  const [completingHandover, setCompletingHandover] = useState(false);
  const [completeMsg,        setCompleteMsg]        = useState<string | null>(null);

  async function handleCompleteNoClerk() {
    if (!confirm(`Complete this handover now? ${handover.familyContactName} will get an email with a link and QR code — no account needed on their end.`)) return;
    setCompletingHandover(true);
    setCompleteMsg(null);
    try {
      const res = await fetch(`/api/memorial/${memorialId}/handover/complete`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCompleteMsg(data.data?.warning ?? `Done — access card sent to ${handover.familyContactEmail}.`);
        router.refresh();
      } else {
        setCompleteMsg(data.error ?? 'Failed to complete handover.');
      }
    } catch {
      setCompleteMsg('Failed to complete handover. Please check your connection and try again.');
    }
    setCompletingHandover(false);
  }

  async function handleCancel() {
    if (!confirm('Cancel this handover? The family accept link will stop working.')) return;
    setCancelling(true);
    const res = await fetch(`/api/memorial/${memorialId}/handover`, { method: 'DELETE' });
    if (res.ok) onCancel();
    setCancelling(false);
  }

  async function handleGrantFamilyAccess() {
    setGrantingAccess(true);
    setAccessMsg(null);
    try {
      const res = await fetch(`/api/memorial/${memorialId}/handover/family-access`, { method: 'POST' });
      const data = await res.json();
      setAccessMsg(data.success
        ? `Sent to ${handover.familyContactEmail}.`
        : (data.error ?? 'Failed to send.'));
    } catch {
      setAccessMsg('Failed to send. Please check your connection and try again.');
    }
    setGrantingAccess(false);
  }

  function handleCopy() {
    if (!handover.acceptUrl) return;
    navigator.clipboard.writeText(handover.acceptUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy(handover.acceptUrl!);
    });
  }

  const isActive = handover.status === 'PENDING' || handover.status === 'SCHEDULED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {[
          { label: 'Family contact', value: handover.familyContactName },
          { label: 'Email',          value: handover.familyContactEmail },
          { label: 'Phone',          value: handover.familyContactPhone ?? '—' },
          { label: 'Scheduled for',  value: handover.scheduledAt ? fmtDate(handover.scheduledAt) : 'Manual (send link)' },
          { label: 'Configured on',  value: fmtDate(handover.createdAt) },
          { label: 'Link expires',   value: fmtDate(handover.acceptTokenExpiresAt) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ margin: 0, fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ash)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{label}</p>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ADDED — primary completion path: no Clerk account for the
          family, ever. The accept-link block below is the older,
          Clerk-based alternative — kept working, not removed, but no
          longer the primary recommended action. */}
      {isActive && (
        <div style={{ background: 'var(--ivory)', borderRadius: 8, padding: '1rem', border: '2px solid var(--gold)' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold)', fontFamily: 'var(--font-body)' }}>
            Recommended
          </p>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--ink)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Hand this memorial over directly — the family gets an email with a simple
            link and a QR code for their card. No account or password needed on their end.
          </p>
          <button
            onClick={handleCompleteNoClerk}
            disabled={completingHandover}
            style={{
              fontSize: '0.85rem', padding: '0.6rem 1.25rem', borderRadius: 6,
              border: 'none', background: 'var(--gold)', color: 'var(--ink)',
              fontWeight: 600, cursor: completingHandover ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {completingHandover ? 'Completing…' : 'Complete Handover & Send Access Card'}
          </button>
          {completeMsg && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--ink-light)', fontFamily: 'var(--font-body)' }}>
              {completeMsg}
            </p>
          )}
        </div>
      )}

      {/* Accept link — older, Clerk-based alternative. Still works, but
          requires the family member to create/use a Clerk account. */}
      {isActive && handover.acceptUrl && (
        <div style={{ background: 'var(--ivory)', borderRadius: 8, padding: '1rem', border: '1px solid var(--ivory-mid)' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
            Family accept link
          </p>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Send this to the family contact. When they click it and sign in, ownership transfers automatically.
            Link expires {fmtDate(handover.acceptTokenExpiresAt)}.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontSize: '0.72rem', color: 'var(--ink)', background: '#fff', padding: '0.4rem 0.65rem', borderRadius: 6, border: '1px solid var(--ivory-mid)', wordBreak: 'break-all', flex: 1 }}>
              {handover.acceptUrl}
            </code>
            <button onClick={handleCopy} className="btn-ghost" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem', flexShrink: 0 }}>
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      )}

      {/* Completed state */}
      {handover.status === 'COMPLETED' && (
        <div style={{ background: '#D1FAE5', borderRadius: 8, padding: '1.25rem', border: '1px solid #6EE7B7' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#065F46', fontFamily: 'var(--font-body)' }}>
            ✓ Handover completed — {fmtDate(handover.completedAt)}
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#065F46', fontFamily: 'var(--font-body)' }}>
            The family now has full ownership of this memorial. Your access to manage it has ended.
          </p>

          {/* ADDED — family self-service access status + resend.
              A token is generated automatically the moment handover
              completes (see app/api/handover/accept/[token]/route.ts),
              so this is a resend/regenerate control for the common case
              — the family lost their card or never got the email — not
              the only way to grant access in the first place. */}
          <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid #6EE7B7' }}>
            {handover.familyAccessEnabled ? (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#065F46', fontFamily: 'var(--font-body)' }}>
                Family self-service access is active — they can hide comments, hide the memorial,
                and edit basic details without an account.
              </p>
            ) : (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#065F46', fontFamily: 'var(--font-body)' }}>
                Family self-service access has not been granted yet.
              </p>
            )}
            <button
              onClick={handleGrantFamilyAccess}
              disabled={grantingAccess}
              style={{
                fontSize: '0.78rem', padding: '0.4rem 1rem', borderRadius: 6,
                border: '1px solid #6EE7B7', background: 'transparent', color: '#065F46',
                cursor: grantingAccess ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              {grantingAccess ? 'Sending…' : handover.familyAccessEnabled ? 'Resend Access Card' : 'Send Family Access Card'}
            </button>
            {accessMsg && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#065F46', fontFamily: 'var(--font-body)' }}>
                {accessMsg}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cancel */}
      {isActive && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          style={{ alignSelf: 'flex-start', fontSize: '0.78rem', padding: '0.4rem 1rem', borderRadius: 6, border: '1px solid #FCA5A5', background: 'transparent', color: '#991B1B', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          {cancelling ? 'Cancelling…' : 'Cancel Handover'}
        </button>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function HandoverWorkspace({ memorial, handover: initialHandover }: Props) {
  const router  = useRouter();
  const [handover, setHandover] = useState(initialHandover);
  const isHandedOver = memorial.workflowStage === 'HANDED_OVER';

  function handleSaved(h: Handover) {
    setHandover(h);
    router.refresh();
  }

  function handleCancel() {
    setHandover(null);
    router.refresh();
  }

  return (
    <div className="page-body">

      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <nav style={{ fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', marginBottom: '0.4rem' }}>
            <Link href="/dashboard/memorials" style={{ color: 'var(--ash)', textDecoration: 'none' }}>← Memorials</Link>
            <span style={{ margin: '0 0.4rem' }}>/</span>
            <span style={{ color: 'var(--ink)' }}>{memorial.title}</span>
            <span style={{ margin: '0 0.4rem' }}>/</span>
            <span style={{ color: 'var(--ink)' }}>Handover</span>
          </nav>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
            Responsibility Handover
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--ash)', margin: '0.3rem 0 0' }}>
            Transfer ownership of this memorial from your funeral home to the family.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {handover && <StatusBadge status={handover.status} />}
          <Link href={`/dashboard/memorial/${memorial.id}/preview`} className="btn-ghost" style={{ fontSize: '0.82rem' }}>
            Preview
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Warning banner */}
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '1.1rem 1.25rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#92400E', fontFamily: 'var(--font-body)', marginBottom: '0.3rem' }}>
              ⚠️ What happens after handover
            </p>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.82rem', color: '#92400E', fontFamily: 'var(--font-body)', lineHeight: 1.7 }}>
              <li>Your funeral home loses all access to manage this memorial</li>
              <li>The family contact gains full ownership</li>
              <li>The public memorial link stays the same — nothing changes for visitors</li>
              <li>This action cannot be undone once the family accepts</li>
            </ul>
          </div>

          {/* Form or configured state */}
          <div className="card" style={{ padding: '1.75rem' }}>
            {isHandedOver ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</p>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: 'var(--ink)', marginBottom: '0.5rem' }}>
                  Handover Complete
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
                  This memorial is now managed by the family.
                </p>
              </div>
            ) : handover && handover.status !== 'CANCELLED' ? (
              <HandoverConfigured
                memorialId={memorial.id}
                handover={handover}
                onCancel={handleCancel}
                onCopy={() => {}}
              />
            ) : (
              <HandoverForm
                memorialId={memorial.id}
                funeralDate={memorial.funeralDate}
                existing={null}
                onSaved={handleSaved}
              />
            )}
          </div>
        </div>

        {/* Sidebar info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.75rem' }}>
              Workflow Status
            </h3>
            {[
              { stage: 'COLLECTING', label: 'Collecting content' },
              { stage: 'CURATING',   label: 'Curating & reviewing' },
              { stage: 'LIVE',       label: 'Published & live' },
              { stage: 'HANDED_OVER', label: 'Handed over to family' },
            ].map(({ stage, label }) => {
              const stages = ['COLLECTING', 'CURATING', 'LIVE', 'HANDED_OVER'];
              const current = stages.indexOf(memorial.workflowStage);
              const thisIdx = stages.indexOf(stage);
              const done    = thisIdx < current;
              const active  = stage === memorial.workflowStage;
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0', borderBottom: '1px solid var(--ivory-mid)' }}>
                  <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{done ? '✅' : active ? '🔵' : '⬜'}</span>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-body)', color: active ? 'var(--ink)' : 'var(--ash)', fontWeight: active ? 600 : 400 }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {memorial.funeralDate && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <p style={{ margin: 0, fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ash)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Funeral Date</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '1rem', fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{fmtDate(memorial.funeralDate)}</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
                Suggested handover: 7 days after
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
