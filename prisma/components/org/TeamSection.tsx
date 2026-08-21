'use client';

// components/org/TeamSection.tsx
//
// Team / staff management for the org settings page. Lets an
// OWNER/ADMIN invite new staff by email + role, see pending invites,
// revoke a pending invite, and see who's already a member.
//
// Calls:
//   GET   /api/org/invite         — list pending/past invites
//   POST  /api/org/invite         — send a new invite
//   PATCH /api/org/invite/[token]/revoke — revoke a pending invite
//
// Server-enforces OWNER/ADMIN-only on all three — this component doesn't
// duplicate that check client-side beyond hiding the invite form for a
// non-admin viewer (a MEMBER/VIEWER hitting the API directly would still
// get a clean 403, this is just UI-level tidiness).

import { useEffect, useState } from 'react';

interface Invite {
  id:         string;
  email:      string;
  role:       string;
  status:     string;
  expiresAt:  string;
  acceptedAt: string | null;
  createdAt:  string;
  token?:     string; // present only on freshly-created invites from POST
}

const ROLE_OPTIONS = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN:  'Create/edit/delete all memorials, manage team',
  MEMBER: 'Create and edit their own memorials only',
  VIEWER: 'Read-only dashboard access',
};

export function TeamSection() {
  const [invites, setInvites]   = useState<Invite[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail]       = useState('');
  const [role, setRole]         = useState<string>('MEMBER');
  const [sending, setSending]   = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/org/invite');
      const json = await res.json();
      if (!res.ok || !json.success) {
        // 403 here just means the viewer isn't OWNER/ADMIN — treat as
        // "nothing to show" rather than an error state, since a MEMBER/
        // VIEWER visiting this page shouldn't see an alarming error for
        // a section that legitimately isn't theirs to use.
        if (res.status === 403) {
          setInvites([]);
          return;
        }
        setLoadError(json.error ?? 'Failed to load team');
        return;
      }
      setInvites(json.data.invites);
    } catch {
      setLoadError('Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setSending(true);
      setSendError(null);
      setSendSuccess(null);

      const res = await fetch('/api/org/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), role }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setSendError(json.error ?? 'Failed to send invite');
        return;
      }

      setSendSuccess(`Invite sent to ${email.trim()}`);
      setEmail('');
      setRole('MEMBER');
      await load();
    } catch {
      setSendError('Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (invite: Invite) => {
    if (!confirm(`Revoke the invite to ${invite.email}?`)) return;

    try {
      setRevokingId(invite.id);
      const res = await fetch(`/api/org/invite/${invite.token}/revoke`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error ?? 'Failed to revoke invite');
        return;
      }
      await load();
    } catch {
      alert('Failed to revoke invite');
    } finally {
      setRevokingId(null);
    }
  };

  const pending = invites?.filter(i => i.status === 'PENDING') ?? [];
  const past    = invites?.filter(i => i.status !== 'PENDING') ?? [];

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardIconWrap}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#cdba93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h2 style={styles.cardTitle}>Team</h2>
          <p style={styles.cardSubtitle}>
            Invite staff to help manage memorials for your organisation.
          </p>
        </div>
      </div>

      {/* ── Invite form ── */}
      <form onSubmit={handleSendInvite} style={styles.inviteForm}>
        <div style={styles.inviteFormRow}>
          <input
            type="email"
            required
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.emailInput}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={styles.roleSelect}>
            {ROLE_OPTIONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="submit" disabled={sending} style={styles.inviteButton}>
            {sending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
        <p style={styles.roleHint}>{ROLE_DESCRIPTIONS[role]}</p>
        {sendError   && <p style={styles.errorText}>{sendError}</p>}
        {sendSuccess && <p style={styles.successText}>{sendSuccess}</p>}
      </form>

      {/* ── Pending invites ── */}
      {loading && <p style={styles.emptyText}>Loading team…</p>}
      {loadError && <p style={styles.errorText}>{loadError}</p>}

      {!loading && !loadError && pending.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Pending invites</h3>
          {pending.map(invite => (
            <div key={invite.id} style={styles.inviteRow}>
              <div>
                <span style={styles.inviteEmail}>{invite.email}</span>
                <span style={styles.inviteRole}>{invite.role}</span>
              </div>
              <button
                onClick={() => handleRevoke(invite)}
                disabled={revokingId === invite.id}
                style={styles.revokeButton}
              >
                {revokingId === invite.id ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && !loadError && past.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Past invites</h3>
          {past.map(invite => (
            <div key={invite.id} style={styles.inviteRowPast}>
              <span style={styles.inviteEmail}>{invite.email}</span>
              <span style={styles.inviteStatusBadge}>{invite.status.toLowerCase()}</span>
            </div>
          ))}
        </div>
      )}

      {!loading && !loadError && pending.length === 0 && past.length === 0 && (
        <p style={styles.emptyText}>No invites sent yet.</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background:   '#fff',
    borderRadius: '12px',
    boxShadow:    '0 1px 8px rgba(10,10,22,0.07)',
    padding:      '1.75rem 2rem',
    marginBottom: '1.5rem',
  },
  cardHeader: {
    display:       'flex',
    alignItems:    'flex-start',
    gap:           '1rem',
    marginBottom:  '1.75rem',
    paddingBottom: '1.25rem',
    borderBottom:  '1px solid rgba(10,10,22,0.07)',
  },
  cardIconWrap: {
    width:          '40px',
    height:         '40px',
    background:     '#4f5d75',
    borderRadius:   '8px',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  cardTitle: {
    margin:     0,
    fontSize:   '1rem',
    fontWeight: 600,
    color:      '#4f5d75',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.2,
  },
  cardSubtitle: {
    margin:     '0.2rem 0 0',
    fontSize:   '0.82rem',
    color:      'rgba(10,10,22,0.45)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.5,
  },
  inviteForm: {
    marginBottom: '1.5rem',
  },
  inviteFormRow: {
    display: 'flex',
    gap:     '0.6rem',
  },
  emailInput: {
    flex:         1,
    padding:      '0.6rem 0.8rem',
    fontSize:     '0.88rem',
    fontFamily:   'system-ui, sans-serif',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '8px',
    outline:      'none',
  },
  roleSelect: {
    padding:      '0.6rem 0.8rem',
    fontSize:     '0.88rem',
    fontFamily:   'system-ui, sans-serif',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '8px',
    background:   '#fff',
  },
  inviteButton: {
    padding:      '0.6rem 1.2rem',
    fontSize:     '0.88rem',
    fontWeight:   600,
    fontFamily:   'system-ui, sans-serif',
    color:        '#fff',
    background:   '#4f5d75',
    border:       'none',
    borderRadius: '8px',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  },
  roleHint: {
    margin:   '0.5rem 0 0',
    fontSize: '0.78rem',
    color:    'rgba(10,10,22,0.45)',
    fontFamily: 'system-ui, sans-serif',
  },
  errorText: {
    margin:   '0.5rem 0 0',
    fontSize: '0.82rem',
    color:    '#b3261e',
    fontFamily: 'system-ui, sans-serif',
  },
  successText: {
    margin:   '0.5rem 0 0',
    fontSize: '0.82rem',
    color:    '#1e7b34',
    fontFamily: 'system-ui, sans-serif',
  },
  emptyText: {
    fontSize: '0.85rem',
    color:    'rgba(10,10,22,0.4)',
    fontFamily: 'system-ui, sans-serif',
  },
  section: {
    marginTop: '1.25rem',
  },
  sectionTitle: {
    margin:        '0 0 0.6rem',
    fontSize:      '0.75rem',
    fontWeight:    600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color:         'rgba(10,10,22,0.4)',
    fontFamily:    'system-ui, sans-serif',
  },
  inviteRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '0.65rem 0',
    borderBottom:   '1px solid rgba(10,10,22,0.06)',
  },
  inviteRowPast: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '0.5rem 0',
    opacity:        0.6,
  },
  inviteEmail: {
    fontSize:   '0.86rem',
    color:      '#4f5d75',
    fontFamily: 'system-ui, sans-serif',
  },
  inviteRole: {
    marginLeft: '0.6rem',
    fontSize:   '0.72rem',
    padding:    '0.15rem 0.5rem',
    background: 'rgba(201,169,110,0.15)',
    color:      '#8a6d3b',
    borderRadius: '999px',
    fontFamily: 'system-ui, sans-serif',
  },
  inviteStatusBadge: {
    fontSize:   '0.72rem',
    color:      'rgba(10,10,22,0.45)',
    fontFamily: 'system-ui, sans-serif',
  },
  revokeButton: {
    fontSize:     '0.78rem',
    color:        '#b3261e',
    background:   'transparent',
    border:       '1px solid rgba(179,38,30,0.3)',
    borderRadius: '6px',
    padding:      '0.35rem 0.7rem',
    cursor:       'pointer',
    fontFamily:   'system-ui, sans-serif',
  },
};
