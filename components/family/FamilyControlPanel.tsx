'use client';

import { useState } from 'react';

interface Item {
  id: string;
  authorName: string | null;
  message: string;
  familyHidden: boolean;
  createdAt: Date;
}

interface Props {
  memorial: {
    id: string;
    title: string;
    status: string;
    sealed: boolean;
    heroImageKey: string | null;
    birthDate: Date | null;
    deathDate: Date | null;
    description: string | null;
  };
  memories: Item[];
  guestBookEntries: Item[];
}

export default function FamilyControlPanel({ memorial, memories, guestBookEntries }: Props) {
  const [visible, setVisible] = useState(memorial.status === 'ACTIVE');
  const [items, setItems] = useState(
    [...memories.map(m => ({ ...m, type: 'memory' as const })),
     ...guestBookEntries.map(g => ({ ...g, type: 'guestbook' as const }))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(memorial.description ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function toggleVisibility(next: boolean) {
    setVisible(next); // optimistic — this is a low-stakes, reversible toggle
    const res = await fetch(`/api/family-access/${memorial.id}/visibility`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ visible: next }),
    });
    const data = await res.json();
    if (!data.success) {
      setVisible(!next); // revert on failure — e.g. sealed memorial rejection
      setStatusMsg(data.error);
    }
  }

  async function toggleComment(id: string, type: 'memory' | 'guestbook', hidden: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, familyHidden: hidden } : i));
    const res = await fetch(`/api/family-access/${memorial.id}/hide-comment`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type, id, hidden }),
    });
    const data = await res.json();
    if (!data.success) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, familyHidden: !hidden } : i));
      setStatusMsg(data.error);
    }
  }

  async function saveDetails() {
    setSavingDetails(true);
    setStatusMsg(null);
    const res = await fetch(`/api/family-access/${memorial.id}/details`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description }),
    });
    const data = await res.json();
    setSavingDetails(false);
    if (data.success) {
      setEditing(false);
    } else {
      setStatusMsg(data.error);
    }
  }

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: '12px', padding: '1.75rem',
    marginBottom: '1.5rem', border: '1px solid var(--ivory-dark)',
  };
  const label: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--ink)',
    marginBottom: '0.5rem', fontWeight: 600,
  };
  const desc: React.CSSProperties = {
    fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--ink-light)',
    lineHeight: 1.6, marginBottom: '1.25rem',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)', padding: '2rem 1.25rem 4rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '0.5rem' }}>
          Managing
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.85rem', color: 'var(--ink)', marginBottom: '2rem', fontWeight: 400 }}>
          {memorial.title}
        </h1>

        {statusMsg && (
          <div style={{ ...card, borderColor: '#e0b0a0', background: '#fff5f2', marginBottom: '1.5rem' }}>
            <p style={{ color: '#a33', fontFamily: 'var(--font-body)', fontSize: '1rem', margin: 0 }}>{statusMsg}</p>
          </div>
        )}

        {memorial.sealed && (
          <div style={{ ...card, background: 'var(--ivory-mid)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--ink-muted)', margin: 0 }}>
              This memorial has been finalised and its details can no longer be changed.
              You can still hide comments below.
            </p>
          </div>
        )}

        {/* Visibility */}
        <div style={card}>
          <div style={label}>Show this memorial to visitors</div>
          <div style={desc}>
            {visible
              ? 'This memorial is currently visible to anyone with the link or QR code.'
              : 'This memorial is currently hidden. Only you can see it.'}
          </div>
          <button
            onClick={() => toggleVisibility(!visible)}
            disabled={memorial.sealed}
            style={{
              fontSize: '1.1rem', padding: '0.85rem 1.75rem', borderRadius: '8px',
              border: 'none', cursor: memorial.sealed ? 'default' : 'pointer',
              opacity: memorial.sealed ? 0.5 : 1,
              background: visible ? '#e8e2d2' : 'var(--gold)',
              color: 'var(--ink)', fontFamily: 'var(--font-body)', fontWeight: 600,
            }}
          >
            {visible ? 'Hide Memorial' : 'Show Memorial'}
          </button>
        </div>

        {/* Basic details */}
        <div style={card}>
          <div style={label}>About this memorial</div>
          {!editing ? (
            <>
              <div style={desc}>{memorial.description || 'No description yet.'}</div>
              {!memorial.sealed && (
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    fontSize: '1rem', padding: '0.75rem 1.5rem', borderRadius: '8px',
                    border: '2px solid var(--gold)', background: 'transparent',
                    color: 'var(--ink)', fontFamily: 'var(--font-body)', cursor: 'pointer',
                  }}
                >
                  Edit Description
                </button>
              )}
            </>
          ) : (
            <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                style={{
                  width: '100%', fontSize: '1rem', padding: '0.85rem', borderRadius: '8px',
                  border: '2px solid var(--ivory-dark)', fontFamily: 'var(--font-body)',
                  marginBottom: '1rem', color: 'var(--ink)',
                }}
              />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={saveDetails}
                  disabled={savingDetails}
                  style={{
                    fontSize: '1rem', padding: '0.75rem 1.5rem', borderRadius: '8px',
                    border: 'none', background: 'var(--gold)', color: 'var(--ink)',
                    fontFamily: 'var(--font-body)', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {savingDetails ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setDescription(memorial.description ?? ''); }}
                  style={{
                    fontSize: '1rem', padding: '0.75rem 1.5rem', borderRadius: '8px',
                    border: '2px solid var(--ivory-dark)', background: 'transparent',
                    color: 'var(--ink-light)', fontFamily: 'var(--font-body)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        {/* Comments */}
        <div style={card}>
          <div style={label}>Messages and photos from visitors</div>
          <div style={desc}>
            You can hide anything you'd rather not show. Hiding is reversible — nothing is deleted.
          </div>

          {items.length === 0 && (
            <p style={{ color: 'var(--ink-muted)', fontFamily: 'var(--font-body)' }}>No messages yet.</p>
          )}

          {items.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              style={{
                padding: '1rem', borderRadius: '8px', marginBottom: '0.75rem',
                background: item.familyHidden ? 'var(--ivory-mid)' : 'var(--ivory)',
                border: '1px solid var(--ivory-dark)',
              }}
            >
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                {item.authorName || 'Anonymous'}
              </p>
              <p style={{ fontFamily: 'var(--font-body)', color: 'var(--ink-light)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                {item.message}
              </p>
              <button
                onClick={() => toggleComment(item.id, item.type, !item.familyHidden)}
                style={{
                  fontSize: '0.9rem', padding: '0.5rem 1rem', borderRadius: '6px',
                  border: '1px solid var(--ivory-dark)', background: '#fff',
                  color: 'var(--ink-light)', fontFamily: 'var(--font-body)', cursor: 'pointer',
                }}
              >
                {item.familyHidden ? 'Show this' : 'Hide this'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
