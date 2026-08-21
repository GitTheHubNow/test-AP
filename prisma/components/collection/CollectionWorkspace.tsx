'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { getPublicUrl } from '@/lib/upload-shared';

// ── Types ──────────────────────────────────────────────────────────────────

interface CollectionItem {
  id:              string;
  type:            string;
  status:          string;
  uploaderRole:    string;
  title:           string | null;
  description:     string | null;
  category:        string | null;
  blobKey:         string | null;
  mimeType:        string | null;
  sizeBytes:       number | null;
  showPublicly:    boolean;
  featured:        boolean;
  rejectionReason: string | null;
  createdAt:       string;
  invite:          { recipientName: string | null } | null;
}

interface CollectionInvite {
  id:             string;
  token:          string;
  url:            string;
  recipientName:  string | null;
  recipientEmail: string | null;
  status:         string;
  expiresAt:      string;
  usedAt:         string | null;
  uploadCount:    number;
  createdAt:      string;
}

interface Memorial {
  id:              string;
  title:           string;
  firstName:       string | null;
  lastName:        string | null;
  funeralDate:     string | null;
  workflowStage:   string;
  collectionNotes: string | null;
}

interface Props {
  memorial: Memorial;
  items:    CollectionItem[];
  invites:  CollectionInvite[];
  counts:   { total: number; unsorted: number; ready: number; approved: number; rejected: number };
}

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UNSORTED: { label: 'Unsorted', color: '#92400E', bg: '#FEF3C7' },
  READY:    { label: 'Ready',    color: '#1E40AF', bg: '#DBEAFE' },
  APPROVED: { label: 'Approved', color: '#065F46', bg: '#D1FAE5' },
  REJECTED: { label: 'Rejected', color: '#991B1B', bg: '#FEE2E2' },
};

const TYPE_ICON: Record<string, string> = {
  PHOTO:    '🖼️',
  VIDEO:    '🎥',
  STORY:    '✍️',
  DOCUMENT: '📄',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNSORTED;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.15rem 0.6rem', borderRadius: '999px',
      fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em',
      color: cfg.color, background: cfg.bg,
      fontFamily: 'var(--font-body)',
    }}>
      {cfg.label}
    </span>
  );
}

// ── Item Card ──────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onStatusChange,
  onDelete,
}: {
  item:           CollectionItem;
  onStatusChange: (id: string, status: string, rejectionReason?: string) => Promise<void>;
  onDelete:       (id: string) => Promise<void>;
}) {
  const [busy,           setBusy]           = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason,   setRejectReason]   = useState('');
  const [expanded,       setExpanded]       = useState(false);

  async function handleStatus(status: string, reason?: string) {
    setBusy(true);
    await onStatusChange(item.id, status, reason);
    setBusy(false);
    setShowRejectForm(false);
    setRejectReason('');
  }

  async function handleDelete() {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    setBusy(true);
    await onDelete(item.id);
    setBusy(false);
  }

  const isImage    = item.mimeType?.startsWith('image/');
  const uploaderLabel = item.uploaderRole === 'FAMILY'
    ? `Family${item.invite?.recipientName ? ` — ${item.invite.recipientName}` : ''}`
    : 'Staff';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* Thumbnail / type icon */}
      <div style={{ display: 'flex', gap: '1rem', padding: '1rem 1.25rem', alignItems: 'flex-start' }}>

        <div style={{
          width: 72, height: 72, flexShrink: 0, borderRadius: 8,
          background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', fontSize: '1.75rem',
        }}>
          {isImage && item.blobKey ? (
            <img
              src={getPublicUrl(item.blobKey)}
              alt={item.title ?? 'Upload'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>{TYPE_ICON[item.type] ?? '📎'}</span>
          )}
        </div>

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <StatusBadge status={item.status} />
            <span style={{ fontSize: '0.7rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
              {TYPE_ICON[item.type]} {item.type}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
              · {uploaderLabel}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', marginLeft: 'auto' }}>
              {fmtRelative(item.createdAt)}
            </span>
          </div>

          <p style={{
            fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500,
            color: 'var(--ink)', margin: 0, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.title ?? <span style={{ color: 'var(--ash)', fontStyle: 'italic' }}>Untitled</span>}
          </p>

          {item.description && (
            <p style={{
              fontSize: '0.82rem', color: 'var(--ash)', margin: '0.25rem 0 0',
              lineHeight: 1.5, fontFamily: 'var(--font-body)',
              display: '-webkit-box', WebkitLineClamp: expanded ? undefined : 2,
              WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden',
            }}>
              {item.description}
            </p>
          )}

          {item.description && item.description.length > 120 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ fontSize: '0.75rem', color: 'var(--gold)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: '0.2rem' }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {item.sizeBytes && (
            <p style={{ fontSize: '0.7rem', color: 'var(--ash)', margin: '0.2rem 0 0', fontFamily: 'var(--font-body)' }}>
              {fmtBytes(item.sizeBytes)}
            </p>
          )}

          {item.rejectionReason && (
            <p style={{ fontSize: '0.75rem', color: '#991B1B', margin: '0.35rem 0 0', fontFamily: 'var(--font-body)' }}>
              ✗ {item.rejectionReason}
            </p>
          )}
        </div>
      </div>

      {/* Reject form */}
      {showRejectForm && (
        <div style={{ padding: '0 1.25rem 1rem', borderTop: '1px solid var(--ivory-mid)' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink)', fontFamily: 'var(--font-body)', marginBottom: '0.5rem', marginTop: '0.75rem' }}>
            Reason for rejection (optional):
          </p>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={2}
            placeholder="e.g. Duplicate, low quality..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem',
              fontSize: '0.82rem', fontFamily: 'var(--font-body)',
              border: '1px solid var(--ivory-mid)', borderRadius: 6,
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => handleStatus('REJECTED', rejectReason || undefined)}
              disabled={busy}
              className="btn-primary"
              style={{ fontSize: '0.78rem', padding: '0.4rem 1rem', background: '#991B1B', borderColor: '#991B1B' }}
            >
              Confirm Reject
            </button>
            <button
              onClick={() => setShowRejectForm(false)}
              className="btn-ghost"
              style={{ fontSize: '0.78rem', padding: '0.4rem 1rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showRejectForm && (
        <div style={{
          display: 'flex', gap: '0.5rem', padding: '0.65rem 1.25rem',
          borderTop: '1px solid var(--ivory-mid)', background: 'var(--ivory)',
          flexWrap: 'wrap',
        }}>
          {item.status === 'UNSORTED' && (
            <button onClick={() => handleStatus('READY')} disabled={busy} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }}>
              Mark Ready
            </button>
          )}
          {(item.status === 'UNSORTED' || item.status === 'READY') && (
            <button onClick={() => handleStatus('APPROVED')} disabled={busy} className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }}>
              Approve →&nbsp;Publish
            </button>
          )}
          {item.status !== 'APPROVED' && item.status !== 'REJECTED' && (
            <button onClick={() => setShowRejectForm(true)} disabled={busy} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem', color: '#991B1B', borderColor: '#FCA5A5' }}>
              Reject
            </button>
          )}
          {item.status === 'REJECTED' && (
            <button onClick={() => handleStatus('UNSORTED')} disabled={busy} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }}>
              Restore
            </button>
          )}
          {item.status === 'APPROVED' && (
            <span style={{ fontSize: '0.75rem', color: '#065F46', fontFamily: 'var(--font-body)', padding: '0.3rem 0' }}>
              ✓ Published as memory
            </span>
          )}
          {(item.status === 'UNSORTED' || item.status === 'REJECTED') && (
            <button onClick={handleDelete} disabled={busy} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem', marginLeft: 'auto', color: 'var(--ash)' }}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Invite Row ─────────────────────────────────────────────────────────────

function InviteRow({ invite, onRevoke, onCopy }: {
  invite:   CollectionInvite;
  onRevoke: (id: string) => Promise<void>;
  onCopy:   (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleRevoke() {
    if (!confirm('Revoke this invite link? Family will no longer be able to use it.')) return;
    setBusy(true);
    await onRevoke(invite.id);
    setBusy(false);
  }

  const expired  = invite.status === 'EXPIRED' || new Date(invite.expiresAt) < new Date();
  const active   = invite.status === 'PENDING' || invite.status === 'ACCEPTED';
  const statusColor = expired || invite.status === 'REVOKED' ? 'var(--ash)' : '#065F46';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem',
      borderBottom: '1px solid var(--ivory-mid)', flexWrap: 'wrap',
      opacity: busy ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'var(--font-body)', color: 'var(--ink)', fontWeight: 500 }}>
          {invite.recipientName ?? 'Family member'}
          {invite.recipientEmail && <span style={{ color: 'var(--ash)', fontWeight: 400 }}> — {invite.recipientEmail}</span>}
        </p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
          {invite.uploadCount} upload{invite.uploadCount !== 1 ? 's' : ''} · expires {fmtDate(invite.expiresAt)}
          {invite.usedAt && ` · first used ${fmtRelative(invite.usedAt)}`}
        </p>
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: statusColor, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {invite.status}
      </span>
      {active && (
        <>
          <button onClick={() => onCopy(invite.url)} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem' }}>
            Copy Link
          </button>
          <button onClick={handleRevoke} disabled={busy} className="btn-ghost" style={{ fontSize: '0.75rem', padding: '0.3rem 0.85rem', color: 'var(--ash)' }}>
            Revoke
          </button>
        </>
      )}
    </div>
  );
}

// ── Upload Form ────────────────────────────────────────────────────────────

function UploadForm({ memorialId, onSuccess }: { memorialId: string; onSuccess: (item: CollectionItem) => void }) {
  const [type,        setType]        = useState('PHOTO');
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [file,        setFile]        = useState<File | null>(null);
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ACCEPTS: Record<string, string> = {
    PHOTO:    'image/jpeg,image/png,image/webp,image/heic',
    VIDEO:    'video/mp4,video/quicktime',
    STORY:    '',
    DOCUMENT: 'application/pdf',
  };

  async function handleSubmit() {
    if (type !== 'STORY' && !file) { setError('Please select a file.'); return; }
    if (type === 'STORY' && !description && !title) { setError('Add a title or description for the story.'); return; }

    setError(null);
    setUploading(true);

    const fd = new FormData();
    fd.append('type', type);
    if (title)       fd.append('title',       title);
    if (description) fd.append('description', description);
    if (file)        fd.append('file',        file);

    try {
      const res  = await fetch(`/api/memorial/${memorialId}/collection`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');

      onSuccess(data.data.item);
      setTitle(''); setDescription(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '1rem' }}>
        Upload Content
      </h3>

      {/* Type tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['PHOTO', 'VIDEO', 'STORY', 'DOCUMENT'].map(t => (
          <button
            key={t}
            onClick={() => { setType(t); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
            style={{
              padding: '0.35rem 0.9rem', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
              fontFamily: 'var(--font-body)', cursor: 'pointer', border: '1px solid',
              background: type === t ? 'var(--ink)' : 'transparent',
              color:      type === t ? 'var(--ivory)' : 'var(--ash)',
              borderColor: type === t ? 'var(--ink)' : 'var(--ivory-mid)',
              transition: 'all 0.1s',
            }}
          >
            {TYPE_ICON[t]} {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label className="field-label">Title (optional)</label>
          <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wedding photo 1985" />
        </div>

        <div>
          <label className="field-label">{type === 'STORY' ? 'Story *' : 'Caption (optional)'}</label>
          <textarea
            className="field-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder={type === 'STORY' ? 'Write your story here...' : 'Add a caption or description...'}
            style={{ resize: 'vertical' }}
          />
        </div>

        {type !== 'STORY' && (
          <div>
            <label className="field-label">File *</label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTS[type]}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}
            />
            {file && <p style={{ fontSize: '0.72rem', color: 'var(--ash)', marginTop: '0.3rem', fontFamily: 'var(--font-body)' }}>{file.name} — {fmtBytes(file.size)}</p>}
          </div>
        )}

        {error && <p style={{ fontSize: '0.8rem', color: '#991B1B', fontFamily: 'var(--font-body)' }}>{error}</p>}

        <button onClick={handleSubmit} disabled={uploading} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  );
}

// ── Invite Panel ───────────────────────────────────────────────────────────

function InvitePanel({ memorialId, invites: initialInvites }: { memorialId: string; invites: CollectionInvite[] }) {
  const [invites,       setInvites]       = useState(initialInvites);
  const [showForm,      setShowForm]      = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [email,         setEmail]         = useState('');
  const [busy,          setBusy]          = useState(false);
  const [copied,        setCopied]        = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    const res  = await fetch(`/api/memorial/${memorialId}/collection/invite`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ recipientName: recipientName || undefined, recipientEmail: email || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      setInvites(prev => [data.data.invite, ...prev]);
      setShowForm(false);
      setRecipientName(''); setEmail('');
    }
    setBusy(false);
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/memorial/${memorialId}/collection/invite/${id}/revoke`, { method: 'PATCH' });
    if (res.ok) {
      setInvites(prev => prev.map(i => i.id === id ? { ...i, status: 'REVOKED' } : i));
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--ivory-mid)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
          Family Invite Links
        </h3>
        <button onClick={() => setShowForm(s => !s)} className="btn-ghost" style={{ fontSize: '0.78rem', padding: '0.3rem 0.85rem' }}>
          {showForm ? 'Cancel' : '+ New Invite'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--ivory-mid)', background: 'var(--ivory)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="field-label">Recipient name (optional)</label>
              <input className="field-input" value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. Sarah" />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="field-label">Email (optional, audit only)</label>
              <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sarah@email.com" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={busy} className="btn-primary" style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
            {busy ? 'Creating…' : 'Generate Link'}
          </button>
        </div>
      )}

      {copied && (
        <div style={{ padding: '0.5rem 1.25rem', background: '#D1FAE5', fontSize: '0.78rem', color: '#065F46', fontFamily: 'var(--font-body)' }}>
          ✓ Link copied to clipboard
        </div>
      )}

      {invites.length === 0 ? (
        <p style={{ padding: '1.5rem 1.25rem', fontSize: '0.85rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', margin: 0 }}>
          No invite links yet. Create one to let family members upload content.
        </p>
      ) : (
        invites.map(inv => (
          <InviteRow key={inv.id} invite={inv} onRevoke={handleRevoke} onCopy={handleCopy} />
        ))
      )}
    </div>
  );
}

// ── Main Workspace ─────────────────────────────────────────────────────────

export function CollectionWorkspace({ memorial, items: initialItems, invites, counts: initialCounts }: Props) {
  const [items,  setItems]  = useState(initialItems);
  const [filter, setFilter] = useState<string>('ALL');
  const [tab,    setTab]    = useState<'items' | 'invites'>('items');

  const counts = {
    total:    items.length,
    unsorted: items.filter(i => i.status === 'UNSORTED').length,
    ready:    items.filter(i => i.status === 'READY').length,
    approved: items.filter(i => i.status === 'APPROVED').length,
    rejected: items.filter(i => i.status === 'REJECTED').length,
  };

  const filtered = filter === 'ALL' ? items : items.filter(i =>
    filter === 'PHOTO' || filter === 'VIDEO' || filter === 'STORY' || filter === 'DOCUMENT'
      ? i.type === filter
      : i.status === filter
  );

  const handleStatusChange = useCallback(async (id: string, status: string, rejectionReason?: string) => {
    const res = await fetch(`/api/memorial/${memorial.id}/collection/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status, ...(rejectionReason ? { rejectionReason } : {}) }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...data.data.item } : i));
    }
  }, [memorial.id]);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/memorial/${memorial.id}/collection/${id}`, { method: 'DELETE' });
    if (res.ok) setItems(prev => prev.filter(i => i.id !== id));
  }, [memorial.id]);

  const handleUploadSuccess = useCallback((item: CollectionItem) => {
    setItems(prev => [item, ...prev]);
  }, []);

  const FILTERS = [
    { key: 'ALL',      label: `All (${counts.total})` },
    { key: 'UNSORTED', label: `Unsorted (${counts.unsorted})` },
    { key: 'READY',    label: `Ready (${counts.ready})` },
    { key: 'APPROVED', label: `Approved (${counts.approved})` },
    { key: 'REJECTED', label: `Rejected (${counts.rejected})` },
    { key: 'PHOTO',    label: '🖼️ Photos' },
    { key: 'VIDEO',    label: '🎥 Videos' },
    { key: 'STORY',    label: '✍️ Stories' },
    { key: 'DOCUMENT', label: '📄 Docs' },
  ];

  return (
    <div className="page-body">

      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <nav style={{ fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', marginBottom: '0.4rem' }}>
            <Link href="/dashboard/memorials" style={{ color: 'var(--ash)', textDecoration: 'none' }}>← Memorials</Link>
            <span style={{ margin: '0 0.4rem' }}>/</span>
            <Link href={`/dashboard/memorial/${memorial.id}/settings`} style={{ color: 'var(--ash)', textDecoration: 'none' }}>{memorial.title}</Link>
            <span style={{ margin: '0 0.4rem' }}>/</span>
            <span style={{ color: 'var(--ink)' }}>Collection</span>
          </nav>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: 'var(--ink)', margin: 0 }}>
            Collection Workspace
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--ash)', margin: '0.3rem 0 0' }}>
            Stage and review content before publishing to the memorial.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Count chips */}
          {counts.unsorted > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '0.2rem 0.65rem', borderRadius: 999, fontFamily: 'var(--font-body)' }}>
              {counts.unsorted} unsorted
            </span>
          )}
          {counts.ready > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1E40AF', background: '#DBEAFE', padding: '0.2rem 0.65rem', borderRadius: 999, fontFamily: 'var(--font-body)' }}>
              {counts.ready} ready
            </span>
          )}
          <Link href={`/dashboard/memorial/${memorial.id}/preview`} className="btn-primary" style={{ fontSize: '0.82rem' }}>
            Preview Memorial →
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ivory-mid)', marginBottom: '1.5rem', gap: '0' }}>
        {([['items', 'Content'], ['invites', 'Family Invites']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '0.65rem 1.25rem', fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--ink)' : 'var(--ash)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* Sidebar filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  textAlign: 'left', padding: '0.45rem 0.85rem', borderRadius: 6,
                  fontSize: '0.82rem', fontFamily: 'var(--font-body)', cursor: 'pointer',
                  border: 'none',
                  background: filter === key ? 'var(--ink)' : 'transparent',
                  color:      filter === key ? 'var(--ivory)' : 'var(--ash)',
                  fontWeight: filter === key ? 600 : 400,
                  transition: 'all 0.1s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <UploadForm memorialId={memorial.id} onSuccess={handleUploadSuccess} />

            {filtered.length === 0 ? (
              <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</p>
                <p style={{ fontFamily: 'var(--font-body)', color: 'var(--ash)', fontSize: '0.9rem' }}>
                  {filter === 'ALL' ? 'No content yet — upload something above.' : `No ${filter.toLowerCase()} items.`}
                </p>
              </div>
            ) : (
              filtered.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'invites' && (
        <InvitePanel memorialId={memorial.id} invites={invites} />
      )}
    </div>
  );
}
