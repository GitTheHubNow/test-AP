'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────

interface Photo {
  id:             string;
  type:           string;
  status:         string;
  blobKey:        string | null;
  mimeType:       string | null;
  sizeBytes:      number | null;
  title:          string | null;
  caption:        string | null;
  uploaderName:   string | null;
  uploaderEmail:  string | null;
  uploaderRole:   string;
  forTribute:     boolean;
  forMemorial:    boolean;
  isHero:         boolean;
  sortOrder:      number | null;
  tributeOrder:   number | null;
  tributeDuration: number | null;
  rejectionReason: string | null;
  createdAt:      string;
  url:            string | null;
}

interface UploaderGroup {
  name:   string;
  email:  string | null;
  role:   string;
  photos: Photo[];
}

interface Memorial {
  id:               string;
  title:            string;
  displayName:      string;
  workflowStage:    string;
  uploadUrl:        string | null;
  uploadLinkEnabled: boolean;
}

interface Counts {
  total:       number;
  unsorted:    number;
  forTribute:  number;
  forMemorial: number;
  rejected:    number;
}

interface Props {
  memorial:       Memorial;
  photos:         Photo[];
  uploaderGroups: UploaderGroup[];
  counts:         Counts;
}

// ── Filter tabs ────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'unsorted' | 'tribute' | 'memorial' | 'rejected' | 'byUploader';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'unsorted',   label: 'Unsorted' },
  { key: 'tribute',    label: 'For Tribute' },
  { key: 'memorial',   label: 'For Memorial' },
  { key: 'byUploader', label: 'By Uploader' },
  { key: 'rejected',   label: 'Rejected' },
];

// ── Bulk action bar ────────────────────────────────────────────────────────

function BulkBar({
  selectedIds, total, onSelectAll, onClearAll,
  onBulkTribute, onBulkMemorial, onBulkReject, onBulkApprove,
  processing,
}: {
  selectedIds: Set<string>; total: number;
  onSelectAll: () => void; onClearAll: () => void;
  onBulkTribute:  () => void; onBulkMemorial: () => void;
  onBulkReject:   () => void; onBulkApprove:  () => void;
  processing: boolean;
}) {
  if (selectedIds.size === 0) return null;

  const btnBase: React.CSSProperties = {
    fontSize: '0.75rem', padding: '0.35rem 0.85rem', borderRadius: 6,
    border: 'none', cursor: processing ? 'not-allowed' : 'pointer',
    fontWeight: 600, transition: 'opacity 0.15s', opacity: processing ? 0.6 : 1,
  };

  return (
    <div style={{
      position: 'sticky', top: 52, zIndex: 40,
      background: '#1a1a2e', borderBottom: '1px solid #c9a96e',
      padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.78rem', color: '#c9a96e', fontWeight: 600 }}>
        {selectedIds.size} selected
      </span>
      <button onClick={onSelectAll}  style={{ ...btnBase, background: 'transparent', border: '1px solid #8a8a9a', color: '#f5f0e8' }}>Select all {total}</button>
      <button onClick={onClearAll}   style={{ ...btnBase, background: 'transparent', border: '1px solid #8a8a9a', color: '#8a8a9a' }}>Clear</button>
      <div style={{ flex: 1 }} />
      <button onClick={onBulkTribute}  disabled={processing} style={{ ...btnBase, background: '#5B21B6', color: '#fff' }}>🎬 For Tribute</button>
      <button onClick={onBulkMemorial} disabled={processing} style={{ ...btnBase, background: '#0F766E', color: '#fff' }}>🖼 For Memorial</button>
      <button onClick={onBulkApprove}  disabled={processing} style={{ ...btnBase, background: '#065F46', color: '#fff' }}>✓ Approve Both</button>
      <button onClick={onBulkReject}   disabled={processing} style={{ ...btnBase, background: '#991B1B', color: '#fff' }}>✕ Reject</button>
    </div>
  );
}

// ── Photo card ─────────────────────────────────────────────────────────────

function PhotoCard({
  photo, selected, onSelect, onToggle, onReject, onRestore, onSetHero,
  processing,
}: {
  photo:     Photo;
  selected:  boolean;
  onSelect:  (id: string) => void;
  onToggle:  (id: string, field: 'forTribute' | 'forMemorial') => void;
  onReject:  (id: string) => void;
  onRestore: (id: string) => void;
  onSetHero: (id: string) => void;
  processing: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const isRejected = photo.status === 'REJECTED';

  const cardStyle: React.CSSProperties = {
    background: selected ? '#EFF6FF' : '#fff',
    borderRadius: 10,
    border: selected ? '2px solid #3B82F6' : `1px solid ${isRejected ? '#FCA5A5' : '#e8e4dc'}`,
    overflow: 'hidden',
    transition: 'border-color 0.1s, background 0.1s',
    opacity: isRejected ? 0.6 : 1,
    position: 'relative',
  };

  return (
    <div style={cardStyle}>
      {/* Checkbox */}
      <div
        onClick={() => onSelect(photo.id)}
        style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, cursor: 'pointer' }}>
        <div style={{
          width: 20, height: 20, borderRadius: 4,
          background: selected ? '#3B82F6' : 'rgba(255,255,255,0.9)',
          border: selected ? '2px solid #3B82F6' : '2px solid #d1ccc5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>✓</span>}
        </div>
      </div>

      {/* Hero badge */}
      {photo.isHero && (
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, background: '#c9a96e', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.6rem', fontWeight: 700, color: '#fff' }}>
          HERO
        </div>
      )}

      {/* Thumbnail */}
      <div style={{ aspectRatio: '1', background: '#f3f0ea', overflow: 'hidden' }}>
        {photo.url && !imgError ? (
          <img
            src={photo.url} alt={photo.title ?? ''}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9c2b8', fontSize: '1.75rem' }}>
            📷
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding: '0.6rem' }}>
        {/* Uploader */}
        <p style={{ margin: 0, fontSize: '0.7rem', color: '#8a8a9a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {photo.uploaderName ?? (photo.uploaderRole === 'STAFF' ? 'Funeral Home' : 'Guest')}
        </p>

        {/* Toggles */}
        {!isRejected && (
          <div style={{ display: 'flex', gap: 4, marginTop: '0.45rem' }}>
            <button
              onClick={() => onToggle(photo.id, 'forTribute')}
              disabled={processing}
              title="For Tribute Video"
              style={{
                flex: 1, padding: '0.3rem 0', borderRadius: 4, border: 'none', fontSize: '0.65rem',
                fontWeight: 600, cursor: 'pointer',
                background: photo.forTribute ? '#5B21B6' : '#f3f0ea',
                color:      photo.forTribute ? '#fff'    : '#8a8a9a',
              }}>
              🎬 {photo.forTribute ? 'Tribute ✓' : 'Tribute'}
            </button>
            <button
              onClick={() => onToggle(photo.id, 'forMemorial')}
              disabled={processing}
              title="Show on Memorial Page"
              style={{
                flex: 1, padding: '0.3rem 0', borderRadius: 4, border: 'none', fontSize: '0.65rem',
                fontWeight: 600, cursor: 'pointer',
                background: photo.forMemorial ? '#0F766E' : '#f3f0ea',
                color:      photo.forMemorial ? '#fff'    : '#8a8a9a',
              }}>
              🖼 {photo.forMemorial ? 'Memorial ✓' : 'Memorial'}
            </button>
          </div>
        )}

        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {!isRejected && !photo.isHero && (
            <button onClick={() => onSetHero(photo.id)} disabled={processing}
              style={{ flex: 1, padding: '0.25rem', borderRadius: 4, border: '1px solid #e8e4dc', background: '#fff', fontSize: '0.6rem', color: '#8a8a9a', cursor: 'pointer' }}>
              Set Hero
            </button>
          )}
          {!isRejected && (
            <button onClick={() => onReject(photo.id)} disabled={processing}
              style={{ flex: 1, padding: '0.25rem', borderRadius: 4, border: '1px solid #FCA5A5', background: '#fff', fontSize: '0.6rem', color: '#991B1B', cursor: 'pointer' }}>
              Reject
            </button>
          )}
          {isRejected && (
            <button onClick={() => onRestore(photo.id)} disabled={processing}
              style={{ flex: 1, padding: '0.25rem', borderRadius: 4, border: '1px solid #6EE7B7', background: '#fff', fontSize: '0.6rem', color: '#065F46', cursor: 'pointer' }}>
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload link share bar ──────────────────────────────────────────────────

function UploadLinkBar({ uploadUrl }: { uploadUrl: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(uploadUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div style={{
      background: '#fffdf5', border: '1px solid #f0e8c8', borderRadius: 10,
      padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
      marginBottom: '1.5rem',
    }}>
      <span style={{ fontSize: '1rem' }}>📸</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#92400E' }}>
          Photo Upload Link
        </p>
        <code style={{ fontSize: '0.7rem', color: '#5a534e', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {uploadUrl}
        </code>
      </div>
      <button
        onClick={handleCopy}
        style={{
          fontSize: '0.78rem', padding: '0.4rem 1rem', borderRadius: 6,
          border: '1px solid #c9a96e', background: copied ? '#c9a96e' : '#fff',
          color: copied ? '#fff' : '#92400E', cursor: 'pointer', fontWeight: 600, flexShrink: 0,
        }}>
        {copied ? '✓ Copied!' : 'Copy Link'}
      </button>
      <a href={uploadUrl} target="_blank" rel="noreferrer"
        style={{ fontSize: '0.72rem', color: '#c9a96e', textDecoration: 'none', flexShrink: 0 }}>
        Preview ↗
      </a>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function PhotoCollectionManager({ memorial, photos: initialPhotos, uploaderGroups: initialGroups, counts: initialCounts }: Props) {
  const router = useRouter();

  const [photos,     setPhotos]     = useState<Photo[]>(initialPhotos);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [filter,     setFilter]     = useState<FilterTab>('all');
  const [processing, setProcessing] = useState(false);

  // ── API call helper ──────────────────────────────────────────────────────

  async function patchPhoto(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/memorial/${memorial.id}/photos/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update photo');
    return res.json();
  }

  async function patchBulk(ids: string[], data: Record<string, unknown>) {
    const res = await fetch(`/api/memorial/${memorial.id}/photos/bulk`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: Array.from(ids), ...data }),
    });
    if (!res.ok) throw new Error('Failed to bulk update');
    return res.json();
  }

  // Optimistic update helper
  function updateLocal(ids: string[], updater: (p: Photo) => Photo) {
    setPhotos(prev => prev.map(p => ids.includes(p.id) ? updater(p) : p));
  }

  // ── Single photo actions ────────────────────────────────────────────────

  async function handleToggle(id: string, field: 'forTribute' | 'forMemorial') {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    const newVal = !photo[field];

    // Optimistic
    updateLocal([id], p => ({ ...p, [field]: newVal, status: 'APPROVED' }));

    try {
      await patchPhoto(id, { [field]: newVal, status: 'APPROVED' });
    } catch {
      // Rollback
      updateLocal([id], p => ({ ...p, [field]: !newVal }));
    }
  }

  async function handleReject(id: string) {
    updateLocal([id], p => ({ ...p, status: 'REJECTED', forTribute: false, forMemorial: false }));
    try {
      await patchPhoto(id, { status: 'REJECTED' });
    } catch {
      updateLocal([id], p => ({ ...p, status: 'UNSORTED' }));
    }
  }

  async function handleRestore(id: string) {
    updateLocal([id], p => ({ ...p, status: 'UNSORTED' }));
    try {
      await patchPhoto(id, { status: 'UNSORTED' });
    } catch {
      updateLocal([id], p => ({ ...p, status: 'REJECTED' }));
    }
  }

  async function handleSetHero(id: string) {
    // Clear all existing hero flags locally
    setPhotos(prev => prev.map(p => ({ ...p, isHero: p.id === id })));
    try {
      await patchPhoto(id, { isHero: true });
    } catch {
      setPhotos(prev => prev.map(p => ({ ...p, isHero: false })));
    }
  }

  // ── Bulk actions ────────────────────────────────────────────────────────

  async function handleBulkTribute() {
    if (selected.size === 0 || processing) return;
    setProcessing(true);
    const ids = Array.from(selected);
    updateLocal(ids, p => ({ ...p, forTribute: true, status: 'APPROVED' }));
    try {
      await patchBulk(ids, { forTribute: true, status: 'APPROVED' });
    } catch (e) { console.error(e); }
    setSelected(new Set());
    setProcessing(false);
  }

  async function handleBulkMemorial() {
    if (selected.size === 0 || processing) return;
    setProcessing(true);
    const ids = Array.from(selected);
    updateLocal(ids, p => ({ ...p, forMemorial: true, status: 'APPROVED' }));
    try {
      await patchBulk(ids, { forMemorial: true, status: 'APPROVED' });
    } catch (e) { console.error(e); }
    setSelected(new Set());
    setProcessing(false);
  }

  async function handleBulkApprove() {
    if (selected.size === 0 || processing) return;
    setProcessing(true);
    const ids = Array.from(selected);
    updateLocal(ids, p => ({ ...p, forTribute: true, forMemorial: true, status: 'APPROVED' }));
    try {
      await patchBulk(ids, { forTribute: true, forMemorial: true, status: 'APPROVED' });
    } catch (e) { console.error(e); }
    setSelected(new Set());
    setProcessing(false);
  }

  async function handleBulkReject() {
    if (selected.size === 0 || processing) return;
    setProcessing(true);
    const ids = Array.from(selected);
    updateLocal(ids, p => ({ ...p, status: 'REJECTED', forTribute: false, forMemorial: false }));
    try {
      await patchBulk(ids, { status: 'REJECTED' });
    } catch (e) { console.error(e); }
    setSelected(new Set());
    setProcessing(false);
  }

  // ── Selection helpers ───────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filteredPhotos.map(p => p.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  // ── Filtered photos ─────────────────────────────────────────────────────

  const filteredPhotos = photos.filter(p => {
    if (filter === 'unsorted')  return p.status === 'UNSORTED';
    if (filter === 'tribute')   return p.forTribute && p.status !== 'REJECTED';
    if (filter === 'memorial')  return p.forMemorial && p.status !== 'REJECTED';
    if (filter === 'rejected')  return p.status === 'REJECTED';
    if (filter === 'byUploader') return true;
    return true; // 'all'
  });

  // Recompute counts from local state
  const counts = {
    total:       photos.length,
    unsorted:    photos.filter(p => p.status === 'UNSORTED').length,
    forTribute:  photos.filter(p => p.forTribute && p.status !== 'REJECTED').length,
    forMemorial: photos.filter(p => p.forMemorial && p.status !== 'REJECTED').length,
    rejected:    photos.filter(p => p.status === 'REJECTED').length,
  };

  // Re-group by uploader from local state
  const uploaderGroups: UploaderGroup[] = [];
  const map = new Map<string, UploaderGroup>();
  for (const p of photos) {
    const key = p.uploaderName ?? p.uploaderEmail ?? p.uploaderRole ?? 'Unknown';
    if (!map.has(key)) {
      map.set(key, {
        name:   p.uploaderName ?? (p.uploaderRole === 'STAFF' ? 'Funeral Home' : 'Family / Guest'),
        email:  p.uploaderEmail,
        role:   p.uploaderRole,
        photos: [],
      });
    }
    map.get(key)!.photos.push(p);
  }
  map.forEach(v => uploaderGroups.push(v));
  uploaderGroups.sort((a, b) => b.photos.length - a.photos.length);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4' }}>
      <BulkBar
        selectedIds={selected} total={filteredPhotos.length}
        onSelectAll={selectAll} onClearAll={clearAll}
        onBulkTribute={handleBulkTribute} onBulkMemorial={handleBulkMemorial}
        onBulkApprove={handleBulkApprove} onBulkReject={handleBulkReject}
        processing={processing}
      />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <nav style={{ fontSize: '0.72rem', color: '#8a8a9a', marginBottom: '0.4rem' }}>
              <Link href="/dashboard/memorials" style={{ color: '#8a8a9a', textDecoration: 'none' }}>← Memorials</Link>
              <span style={{ margin: '0 0.4rem' }}>/</span>
              <span style={{ color: '#1a1714' }}>{memorial.displayName}</span>
              <span style={{ margin: '0 0.4rem' }}>/</span>
              <span style={{ color: '#1a1714' }}>Photos</span>
            </nav>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#1a1714', margin: 0 }}>
              Photo Collection
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href={`/dashboard/memorial/${memorial.id}/video`}
              style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', borderRadius: 6, border: '1px solid #5B21B6', color: '#5B21B6', textDecoration: 'none', background: '#fff' }}>
              🎬 Create Tribute
            </Link>
            <Link href={`/dashboard/memorial/${memorial.id}/preview`}
              style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', borderRadius: 6, border: '1px solid #e8e4dc', color: '#5a534e', textDecoration: 'none', background: '#fff' }}>
              Preview
            </Link>
          </div>
        </div>

        {/* Upload link */}
        {memorial.uploadUrl && <UploadLinkBar uploadUrl={memorial.uploadUrl} />}

        {/* Stat strip */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Total',       value: counts.total,       color: '#1a1714' },
            { label: 'Unsorted',    value: counts.unsorted,    color: counts.unsorted > 0 ? '#92400E' : '#065F46' },
            { label: 'For Tribute', value: counts.forTribute,  color: '#5B21B6' },
            { label: 'For Memorial',value: counts.forMemorial, color: '#0F766E' },
            { label: 'Rejected',    value: counts.rejected,    color: '#8a8a9a' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 8, padding: '0.6rem 1rem', border: '1px solid #e8e4dc', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.65rem', color: '#8a8a9a', marginTop: '0.2rem' }}>{s.label}</div>
            </div>
          ))}
          {counts.unsorted > 0 && (
            <div style={{ alignSelf: 'center', padding: '0.5rem 0.875rem', background: '#FEF3C7', borderRadius: 8, border: '1px solid #FDE68A', fontSize: '0.78rem', color: '#92400E', fontWeight: 600 }}>
              ⚠ {counts.unsorted} photo{counts.unsorted !== 1 ? 's' : ''} need review
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', background: '#fff', borderRadius: 8, border: '1px solid #e8e4dc', overflow: 'hidden', width: 'fit-content' }}>
          {FILTER_TABS.map(tab => (
            <button key={tab.key} onClick={() => { setFilter(tab.key); setSelected(new Set()); }}
              style={{
                padding: '0.55rem 1.1rem', border: 'none', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                background: filter === tab.key ? '#1a1a2e' : 'transparent',
                color:      filter === tab.key ? '#c9a96e' : '#5a534e',
                borderRight: '1px solid #e8e4dc',
                transition: 'background 0.15s',
              }}>
              {tab.label}
              {tab.key === 'unsorted' && counts.unsorted > 0 && (
                <span style={{ marginLeft: 5, background: '#F59E0B', color: '#fff', borderRadius: 999, fontSize: '0.6rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                  {counts.unsorted}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {photos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', background: '#fff', borderRadius: 12, border: '2px dashed #e8e4dc' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', color: '#8a8a9a', marginBottom: '0.5rem' }}>No photos yet</p>
            {memorial.uploadUrl && (
              <p style={{ fontSize: '0.85rem', color: '#b0a898' }}>
                Share the upload link above with family and friends to start collecting photos.
              </p>
            )}
          </div>
        ) : filter === 'byUploader' ? (
          // ── By Uploader view ──
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {uploaderGroups.map((group, gi) => (
              <div key={gi} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e4dc', overflow: 'hidden' }}>
                {/* Group header */}
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f0ebe2', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fdfcfb' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: group.role === 'STAFF' ? '#1a1a2e' : '#c9a96e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                    {group.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#1a1714' }}>{group.name}</p>
                    {group.email && <p style={{ margin: 0, fontSize: '0.72rem', color: '#8a8a9a' }}>{group.email}</p>}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#8a8a9a' }}>{group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}</span>
                  <button
                    onClick={() => {
                      const ids = new Set(group.photos.map(p => p.id));
                      setSelected(prev => {
                        const next = new Set(prev);
                        const allSelected = group.photos.every(p => prev.has(p.id));
                        ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
                        return next;
                      });
                    }}
                    style={{ fontSize: '0.72rem', padding: '0.3rem 0.75rem', borderRadius: 5, border: '1px solid #e8e4dc', background: '#fff', color: '#5a534e', cursor: 'pointer' }}>
                    {group.photos.every(p => selected.has(p.id)) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                {/* Photos grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: '1rem' }}>
                  {group.photos.map(photo => (
                    <PhotoCard key={photo.id} photo={photo} selected={selected.has(photo.id)}
                      onSelect={toggleSelect} onToggle={handleToggle}
                      onReject={handleReject} onRestore={handleRestore}
                      onSetHero={handleSetHero} processing={processing} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Grid view ──
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {filteredPhotos.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#8a8a9a', fontSize: '0.9rem' }}>
                No photos in this category
              </div>
            ) : (
              filteredPhotos.map(photo => (
                <PhotoCard key={photo.id} photo={photo} selected={selected.has(photo.id)}
                  onSelect={toggleSelect} onToggle={handleToggle}
                  onReject={handleReject} onRestore={handleRestore}
                  onSetHero={handleSetHero} processing={processing} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
