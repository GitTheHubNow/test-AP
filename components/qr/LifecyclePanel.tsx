'use client';

// components/qr/LifecyclePanel.tsx
//
// Client component — lets a funeral home configure the QR lifecycle for a memorial.
// Calls the Phase 1 API: GET / PUT /api/memorials/[id]/qr
//
// Rendered below the static QR cards on app/dashboard/memorial/[memorialId]/qr/page.tsx
//
// Requires: organisation.featureQrLifecycle = true
// If the feature flag is off, GET returns 403 and this renders a quiet notice.

import { useEffect, useState } from 'react';
import type { QRState } from '@/types/v2';

interface Props {
  memorialId: string;
}

interface QrInfo {
  publicToken:       string;
  qrUrl:             string;
  qrSvg:             string;
  qrState:           QRState;
  effectiveState:    QRState;
  stateLabel:        string;
  stateDescription:  string;
  serviceStartAt:    string | null;
  unlockAt:          string | null;
  pamphletEnabled:   boolean;
  pamphletTitle:     string | null;
  pamphletVenueNote: string | null;
  pamphletMessage:   string | null;
  suggestedUnlockAt: string | null;
}

const STATE_OPTIONS: { value: QRState; label: string }[] = [
  { value: 'PRE_SERVICE',    label: 'Pre-Service (Pamphlet)' },
  { value: 'SERVICE_ACTIVE', label: 'Service Active' },
  { value: 'UNLOCK_PENDING', label: 'Unlock Pending' },
  { value: 'MEMORIAL_OPEN',  label: 'Memorial Open' },
  { value: 'PRIVATE',        label: 'Private' },
  { value: 'ARCHIVED',       label: 'Archived' },
];

// ISO string -> value for <input type="datetime-local">
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// <input type="datetime-local"> value -> ISO string for the API
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default function LifecyclePanel({ memorialId }: Props) {
  const [info,    setInfo]    = useState<QrInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [notice,  setNotice]  = useState<string | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const [qrState,        setQrState]        = useState<QRState>('MEMORIAL_OPEN');
  const [serviceStartAt, setServiceStartAt] = useState('');
  const [unlockAt,       setUnlockAt]       = useState('');
  const [pamphletEnabled,   setPamphletEnabled]   = useState(false);
  const [pamphletTitle,     setPamphletTitle]     = useState('');
  const [pamphletVenueNote, setPamphletVenueNote] = useState('');
  const [pamphletMessage,   setPamphletMessage]   = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memorials/${memorialId}/qr`);
      if (res.status === 403) {
        setFeatureDisabled(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const data: QrInfo = await res.json();
      setInfo(data);
      setQrState(data.qrState);
      setServiceStartAt(toLocalInput(data.serviceStartAt));
      setUnlockAt(toLocalInput(data.unlockAt));
      setPamphletEnabled(data.pamphletEnabled);
      setPamphletTitle(data.pamphletTitle ?? '');
      setPamphletVenueNote(data.pamphletVenueNote ?? '');
      setPamphletMessage(data.pamphletMessage ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memorialId]);

  function applySuggestedUnlock() {
    if (info?.suggestedUnlockAt) {
      setUnlockAt(toLocalInput(info.suggestedUnlockAt));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        qrState,
        pamphletEnabled,
        pamphletTitle:     pamphletTitle.trim()     || undefined,
        pamphletVenueNote: pamphletVenueNote.trim() || undefined,
        pamphletMessage:   pamphletMessage.trim()   || undefined,
      };

      const startIso  = toIso(serviceStartAt);
      const unlockIso = toIso(unlockAt);
      if (startIso)  body.serviceStartAt = startIso;
      if (unlockIso) body.unlockAt       = unlockIso;

      const res = await fetch(`/api/memorials/${memorialId}/qr`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `Save failed (${res.status})`);
      }

      setNotice('Saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (featureDisabled) {
    return (
      <div style={styles.card}>
        <p style={styles.mutedNote}>
          The QR lifecycle feature is not enabled for your organisation yet.
          Contact Memoriam support to turn this on.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.card}>
        <p style={styles.mutedNote}>Loading lifecycle settings…</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Permanent QR — Lifecycle</h2>
      <p style={styles.desc}>
        This QR never changes. What it shows updates automatically based on
        the settings below.
      </p>

      {info && (
        <div style={styles.currentState}>
          <span style={styles.currentStateLabel}>Currently showing</span>
          <span style={styles.currentStateValue}>{info.stateLabel}</span>
          {info.qrState !== info.effectiveState && (
            <span style={styles.autoNote}>
              (auto-advanced from {info.qrState})
            </span>
          )}
        </div>
      )}

      <label style={styles.label}>QR State</label>
      <select
        value={qrState}
        onChange={(e) => setQrState(e.target.value as QRState)}
        style={styles.select}
      >
        {STATE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <label style={styles.label}>Service Start</label>
      <input
        type="datetime-local"
        value={serviceStartAt}
        onChange={(e) => setServiceStartAt(e.target.value)}
        style={styles.input}
      />

      <label style={styles.label}>
        Memorial Unlocks At
        {info?.suggestedUnlockAt && (
          <button type="button" onClick={applySuggestedUnlock} style={styles.suggestBtn}>
            Use suggested time
          </button>
        )}
      </label>
      <input
        type="datetime-local"
        value={unlockAt}
        onChange={(e) => setUnlockAt(e.target.value)}
        style={styles.input}
      />

      <div style={styles.divider} />
      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={pamphletEnabled}
          onChange={(e) => setPamphletEnabled(e.target.checked)}
        />
        <span>Show service pamphlet before unlock</span>
      </label>

      <label style={styles.label}>Pamphlet Title</label>
      <input
        type="text"
        value={pamphletTitle}
        onChange={(e) => setPamphletTitle(e.target.value)}
        placeholder="e.g. Service for Jane Smith"
        style={styles.input}
      />

      <label style={styles.label}>Venue Note</label>
      <input
        type="text"
        value={pamphletVenueNote}
        onChange={(e) => setPamphletVenueNote(e.target.value)}
        placeholder="e.g. Please use the rear entrance"
        style={styles.input}
      />

      <label style={styles.label}>Message to Attendees</label>
      <textarea
        value={pamphletMessage}
        onChange={(e) => setPamphletMessage(e.target.value)}
        rows={3}
        style={{ ...styles.input, resize: 'vertical' as const }}
      />

      {error  && <p style={styles.error}>{error}</p>}
      {notice && <p style={styles.notice}>{notice}</p>}

      <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
        {saving ? 'Saving…' : 'Save Lifecycle Settings'}
      </button>
    </div>
  );
}

// ── Styles — matches the qr/page.tsx aesthetic (Cormorant + Lato, gold accents) ──

const styles: Record<string, React.CSSProperties> = {
  card: {
    background:   '#fffdf7',
    border:       '1px solid #e8dcc8',
    borderRadius: 12,
    padding:      '2rem',
    maxWidth:     480,
    margin:       '3rem auto 0',
    fontFamily:   'Lato, sans-serif',
  },
  heading: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize:   '1.4rem',
    fontWeight: 600,
    margin:     '0 0 0.4rem',
    color:      '#1a0e05',
  },
  desc: {
    fontSize:   '0.78rem',
    color:      '#9c7c50',
    fontWeight: 300,
    margin:     '0 0 1.25rem',
    lineHeight: 1.5,
  },
  currentState: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.15rem',
    background:    '#f6efe2',
    border:        '1px solid #e8dcc8',
    borderRadius:  8,
    padding:       '0.75rem 1rem',
    marginBottom:  '1.25rem',
  },
  currentStateLabel: {
    fontSize:      '0.6rem',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color:         '#9c7c50',
  },
  currentStateValue: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize:   '1.1rem',
    color:      '#1a0e05',
  },
  autoNote: {
    fontSize: '0.68rem',
    color:    '#b8a080',
  },
  label: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    fontSize:       '0.68rem',
    letterSpacing:  '0.12em',
    textTransform:  'uppercase',
    color:          '#9c7c50',
    margin:         '0.9rem 0 0.35rem',
  },
  select: {
    width:        '100%',
    padding:      '0.55rem 0.7rem',
    borderRadius: 6,
    border:       '1px solid #e8dcc8',
    background:   '#fff',
    fontSize:     '0.85rem',
    color:        '#1a0e05',
    fontFamily:   'Lato, sans-serif',
  },
  input: {
    width:        '100%',
    padding:      '0.55rem 0.7rem',
    borderRadius: 6,
    border:       '1px solid #e8dcc8',
    background:   '#fff',
    fontSize:     '0.85rem',
    color:        '#1a0e05',
    fontFamily:   'Lato, sans-serif',
  },
  checkboxRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.5rem',
    fontSize:   '0.82rem',
    color:      '#1a0e05',
    margin:     '0.5rem 0',
  },
  divider: {
    height:     1,
    background: '#e8dcc8',
    margin:     '1.25rem 0',
  },
  suggestBtn: {
    fontSize:      '0.62rem',
    letterSpacing: '0.05em',
    color:         '#9c7c50',
    background:    'transparent',
    border:        '1px solid #e8dcc8',
    borderRadius:  4,
    padding:       '0.2rem 0.5rem',
    cursor:        'pointer',
  },
  error: {
    fontSize: '0.78rem',
    color:    '#b3261e',
    margin:   '1rem 0 0',
  },
  notice: {
    fontSize: '0.78rem',
    color:    '#3a7d44',
    margin:   '1rem 0 0',
  },
  saveBtn: {
    width:        '100%',
    marginTop:    '1.5rem',
    padding:      '0.7rem',
    borderRadius: 6,
    border:       '1px solid #c9a96e',
    background:   'linear-gradient(135deg, #c9a96e, #e8c87e)',
    color:        '#1a0e05',
    fontFamily:   "'Cormorant Garamond', serif",
    fontSize:     '1rem',
    fontWeight:   600,
    cursor:       'pointer',
  },
  mutedNote: {
    fontSize:   '0.78rem',
    color:      '#9c7c50',
    fontWeight: 300,
    lineHeight: 1.6,
  },
};
