'use client';

import { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface GuestBookEntry {
  id: string;
  authorName: string | null;
  message: string;
  location: string | null;
  createdAt: Date;
  pinned: boolean;
  flaggedByFilter: boolean;
  filterReason: string | null;
}

interface GuestBookListProps {
  memorialId: string;
  pendingEntries: GuestBookEntry[];
  approvedEntries: GuestBookEntry[];
}

function relativeDate(d: Date): string {
  const date = new Date(d);
  const now = new Date();
  const days = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function FlaggedBadge({ reason }: { reason: string | null }) {
  return (
    <span
      title={reason ?? 'Flagged by automated filter'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        borderRadius: '9999px', padding: '0.15rem 0.6rem',
        fontSize: '0.7rem', fontWeight: 600,
        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
      }}
    >
      ⚠ Flagged
    </span>
  );
}

function EntryCard({
  entry,
  onApprove,
  onReject,
  onDelete,
  onTogglePin,
  showApprove,
  busy,
}: {
  entry: GuestBookEntry;
  onApprove?: () => void;
  onReject?: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  showApprove: boolean;
  busy: boolean;
}) {
  return (
    <div
      className="card-elevated"
      style={{
        padding: '1.25rem 1.5rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
        opacity: busy ? 0.5 : 1,
        pointerEvents: busy ? 'none' : 'auto',
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}>
            {entry.authorName || 'Anonymous'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ash)' }}>
            {relativeDate(entry.createdAt)}
            {entry.location && ` · ${entry.location}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {entry.flaggedByFilter && <FlaggedBadge reason={entry.filterReason} />}
          {entry.pinned && (
            <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 600 }}>📌 Pinned</span>
          )}
        </div>
      </div>

      <p style={{ color: 'var(--ink-light)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
        {entry.message}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
        {showApprove && onApprove && (
          <button onClick={onApprove} className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.9rem' }}>
            Approve
          </button>
        )}
        {showApprove && onReject && (
          <button onClick={onReject} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.4rem 0.9rem' }}>
            Reject
          </button>
        )}
        {!showApprove && (
          <button onClick={onTogglePin} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.4rem 0.9rem' }}>
            {entry.pinned ? 'Unpin' : 'Pin to top'}
          </button>
        )}
        <button
          onClick={onDelete}
          style={{
            fontSize: '0.75rem', padding: '0.4rem 0.9rem', marginLeft: 'auto',
            background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function GuestBookList({ memorialId, pendingEntries, approvedEntries }: GuestBookListProps) {
  const [pending, setPending] = useState(pendingEntries);
  const [approved, setApproved] = useState(approvedEntries);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callAction(entryId: string, path: string, method: string, body?: object) {
    setBusyId(entryId);
    setError(null);
    try {
      const res = await fetch(`/api/memorial/${memorialId}/guest-book/${entryId}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong');
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(entry: GuestBookEntry) {
    const ok = await callAction(entry.id, '/approve', 'POST');
    if (ok) {
      setPending(prev => prev.filter(e => e.id !== entry.id));
      setApproved(prev => [entry, ...prev]);
    }
  }

  async function handleReject(entry: GuestBookEntry) {
    const ok = await callAction(entry.id, '/reject', 'POST');
    if (ok) setPending(prev => prev.filter(e => e.id !== entry.id));
  }

  async function handleDelete(entry: GuestBookEntry, fromPending: boolean) {
    if (!confirm('Delete this entry permanently? This cannot be undone.')) return;
    const ok = await callAction(entry.id, '', 'DELETE');
    if (ok) {
      if (fromPending) setPending(prev => prev.filter(e => e.id !== entry.id));
      else setApproved(prev => prev.filter(e => e.id !== entry.id));
    }
  }

  async function handleTogglePin(entry: GuestBookEntry) {
    const nextPinned = !entry.pinned;
    const ok = await callAction(entry.id, '/pin', 'PATCH', { pinned: nextPinned });
    if (ok) {
      setApproved(prev =>
        prev
          .map(e => (e.id === entry.id ? { ...e, pinned: nextPinned } : e))
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      );
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '8px', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <section>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--ink)', marginBottom: '1rem' }}>
            Pending ({pending.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pending.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                showApprove
                busy={busyId === entry.id}
                onApprove={() => handleApprove(entry)}
                onReject={() => handleReject(entry)}
                onDelete={() => handleDelete(entry, true)}
                onTogglePin={() => {}}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--ink)', marginBottom: '1rem' }}>
          Published ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p style={{ color: 'var(--ash)', fontSize: '0.9rem' }}>No guest book entries published yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {approved.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                showApprove={false}
                busy={busyId === entry.id}
                onDelete={() => handleDelete(entry, false)}
                onTogglePin={() => handleTogglePin(entry)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
