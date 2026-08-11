'use client';

import { useState } from 'react';
import { getPublicUrl } from '@/lib/upload-shared';

// ── Types ──────────────────────────────────────────────────────────────────

interface Media {
  id: string;
  blobKey: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: Date;
}

interface Memory {
  id: string;
  authorName: string | null;
  message: string;
  createdAt: Date;
  featured:    boolean;
  isGuestBook: boolean;
  category:    string;
  stale:       boolean;       // Phase 10: flagged by cron if pending > 30 days
  visibleUntil: Date | null;  // Gaps: expiry date
  media?: Media[];
}

interface ModerationListProps {
  memorial: { id: string; title: string };
  pendingMemories:  Memory[];
  approvedMemories: Memory[];
  memorialId: string;
}

// ── Category styles ────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
  GENERAL:    { label: 'Memory',     className: 'bg-gray-100 text-gray-700' },
  CONDOLENCE: { label: 'Condolence', className: 'bg-blue-100 text-blue-700' },
  STORY:      { label: 'Story',      className: 'bg-purple-100 text-purple-700' },
  TRIBUTE:    { label: 'Tribute',    className: 'bg-amber-100 text-amber-700' },
  GUEST_BOOK: { label: 'Guest Book', className: 'bg-green-100 text-green-700' },
};

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.GENERAL;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

// Phase 10: Stale badge — shown when memory has been pending > 30 days
function StaleBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
      title="Pending for more than 30 days"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      30d+
    </span>
  );
}

function StarButton({
  featured,
  disabled,
  onClick,
}: {
  featured: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={featured ? 'Remove from featured' : 'Mark as featured'}
      className={`flex-shrink-0 rounded-full p-1.5 transition-colors disabled:opacity-50 ${
        featured
          ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-amber-500'
      }`}
    >
      <svg className="h-4 w-4" fill={featured ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    </button>
  );
}

// ── VisibleUntil picker — inline expiry setter for approved memories ────────

function VisibleUntilPicker({
  memoryId,
  memorialId,
  current,
  onUpdate,
}: {
  memoryId:   string;
  memorialId: string;
  current:    Date | null;
  onUpdate:   (newDate: Date | null) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [value,   setValue]   = useState(
    current ? new Date(current).toISOString().slice(0, 10) : ''
  );

  const isExpired = current && new Date(current) < new Date();

  async function save(dateStr: string | null) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/memory/${memoryId}/visible-until`,
        {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ visibleUntil: dateStr || null }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save');
      onUpdate(dateStr ? new Date(dateStr) : null);
      setOpen(false);
    } catch (err) {
      console.error('[visibleUntil]', err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-xs px-2 py-1 rounded border transition-colors ${
          isExpired
            ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100'
            : current
              ? 'border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100'
              : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
        }`}
        title="Set expiry date for this memory"
      >
        {isExpired
          ? '⚠ Expired'
          : current
            ? `Expires ${new Date(current).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Set expiry'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        min={new Date().toISOString().slice(0, 10)}
        disabled={saving}
        className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
      />
      <button
        onClick={() => save(value)}
        disabled={saving}
        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? '...' : 'Save'}
      </button>
      {current && (
        <button
          onClick={() => save(null)}
          disabled={saving}
          className="text-xs text-gray-400 hover:text-red-600 px-1 transition-colors"
          title="Remove expiry"
        >
          Remove
        </button>
      )}
      <button
        onClick={() => setOpen(false)}
        disabled={saving}
        className="text-xs text-gray-400 hover:text-gray-600 px-1"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ModerationList({
  memorial,
  pendingMemories: initialPending,
  approvedMemories: initialApproved,
  memorialId,
}: ModerationListProps) {
  const [activeTab,        setActiveTab]        = useState<'pending' | 'approved'>('pending');
  const [pending,          setPending]          = useState<Memory[]>(initialPending);
  const [approved,         setApproved]         = useState<Memory[]>(initialApproved);
  const [processingId,     setProcessingId]     = useState<string | null>(null);
  const [processingMediaId,setProcessingMediaId]= useState<string | null>(null);
  const [togglingFeatured, setTogglingFeatured] = useState<string | null>(null);
  const [error,            setError]            = useState<string | null>(null);

  const staleCount = pending.filter(m => m.stale).length;

  // ── Refetch ────────────────────────────────────────────────────────────

  const refetch = async () => {
    try {
      const res = await fetch(`/api/memorial/${memorialId}/moderation`);
      if (!res.headers.get('content-type')?.includes('application/json')) return;
      const result = await res.json();
      setPending(result.data?.memories || result.memories || []);
    } catch (err) {
      console.error('refetch failed:', err);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleApprove = async (memoryId: string) => {
    setProcessingId(memoryId);
    setError(null);
    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/memory/${memoryId}/approve-with-media`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to approve');
      const memory = pending.find(m => m.id === memoryId);
      if (memory) {
        setPending(prev => prev.filter(m => m.id !== memoryId));
        setApproved(prev => [{ ...memory }, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve memory');
      await refetch();
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (memoryId: string) => {
    setProcessingId(memoryId);
    setError(null);
    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/memory/${memoryId}/reject`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to reject');
      setPending(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject memory');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveMedia = async (mediaId: string) => {
    setProcessingMediaId(mediaId);
    setError(null);
    try {
      const res = await fetch(`/api/memorial/${memorialId}/media/${mediaId}/approve`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to approve photo');
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve photo');
    } finally {
      setProcessingMediaId(null);
    }
  };

  const handleRejectMedia = async (mediaId: string) => {
    setProcessingMediaId(mediaId);
    setError(null);
    try {
      const res = await fetch(`/api/memorial/${memorialId}/media/${mediaId}/reject`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to reject photo');
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject photo');
    } finally {
      setProcessingMediaId(null);
    }
  };

  const handleToggleFeatured = async (memoryId: string, currentFeatured: boolean, list: 'pending' | 'approved') => {
    setTogglingFeatured(memoryId);
    setError(null);
    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/memory/${memoryId}/featured`,
        {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ featured: !currentFeatured }),
        }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to update featured');
      const updater = (prev: Memory[]) =>
        prev.map(m => m.id === memoryId ? { ...m, featured: !currentFeatured } : m);
      if (list === 'pending') setPending(updater);
      else setApproved(updater);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update featured status');
    } finally {
      setTogglingFeatured(null);
    }
  };

  const handleUnapprove = async (memoryId: string) => {
    setProcessingId(memoryId);
    setError(null);
    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/memory/${memoryId}/unapprove`,
        { method: 'POST' }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to unapprove');
      const memory = approved.find(m => m.id === memoryId);
      if (memory) {
        setApproved(prev => prev.filter(m => m.id !== memoryId));
        setPending(prev => [{ ...memory }, ...prev]);
      }
      setActiveTab('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unapprove memory');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectApproved = async (memoryId: string) => {
    setProcessingId(memoryId);
    setError(null);
    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/memory/${memoryId}/reject`,
        { method: 'POST' }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to remove');
      setApproved(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove memory');
    } finally {
      setProcessingId(null);
    }
  };

  const handleVisibleUntilUpdate = (memoryId: string, newDate: Date | null) => {
    setApproved(prev =>
      prev.map(m => m.id === memoryId ? { ...m, visibleUntil: newDate } : m)
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-start">
          <p className="text-sm text-red-800">{error}</p>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-500 text-lg leading-none">×</button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-8">
        {([
          {
            id:    'pending',
            label: 'Pending Review',
            count: pending.length,
            // Show amber dot if there are stale memories
            alert: staleCount > 0,
          },
          { id: 'approved', label: 'Published', count: approved.length, alert: false },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-5 py-3 text-sm font-medium transition-colors focus:outline-none"
            style={{
              color:        activeTab === tab.id ? '#4f46e5' : '#6b7280',
              borderBottom: activeTab === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
              activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
            {/* Stale indicator dot */}
            {tab.alert && (
              <span
                className="absolute top-2 right-1 w-2 h-2 rounded-full bg-amber-400"
                title={`${staleCount} memories pending for 30+ days`}
              />
            )}
          </button>
        ))}
      </div>

      {/* Stale callout — shown at top of pending tab when any are stale */}
      {activeTab === 'pending' && staleCount > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-800">
            <strong>{staleCount} {staleCount === 1 ? 'memory has' : 'memories have'} been waiting for review for more than 30 days.</strong>
            {' '}Submitters may be wondering if their message was received.
          </p>
        </div>
      )}

      {/* ── Pending tab ─────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <>
          {pending.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">All caught up!</h3>
              <p className="mt-1 text-sm text-gray-500">No memories pending review.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                {pending.length} {pending.length === 1 ? 'memory' : 'memories'} awaiting review
              </p>
              {pending.map(memory => (
                <PendingCard
                  key={memory.id}
                  memory={memory}
                  memorialId={memorialId}
                  processingId={processingId}
                  processingMediaId={processingMediaId}
                  togglingFeatured={togglingFeatured}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onApproveMedia={handleApproveMedia}
                  onRejectMedia={handleRejectMedia}
                  onToggleFeatured={id => handleToggleFeatured(id, memory.featured, 'pending')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Approved tab ────────────────────────────────────────────── */}
      {activeTab === 'approved' && (
        <>
          {approved.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">No approved memories yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {approved.length} {approved.length === 1 ? 'memory' : 'memories'} published on the memorial page
              </p>
              {approved.map(memory => (
                <ApprovedCard
                  key={memory.id}
                  memory={memory}
                  memorialId={memorialId}
                  processingId={processingId}
                  togglingFeatured={togglingFeatured}
                  onToggleFeatured={id => handleToggleFeatured(id, memory.featured, 'approved')}
                  onUnapprove={handleUnapprove}
                  onReject={handleRejectApproved}
                  onVisibleUntilUpdate={handleVisibleUntilUpdate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pending card ───────────────────────────────────────────────────────────

function PendingCard({
  memory,
  memorialId,
  processingId,
  processingMediaId,
  togglingFeatured,
  onApprove,
  onReject,
  onApproveMedia,
  onRejectMedia,
  onToggleFeatured,
}: {
  memory: Memory;
  memorialId: string;
  processingId: string | null;
  processingMediaId: string | null;
  togglingFeatured: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveMedia: (id: string) => void;
  onRejectMedia: (id: string) => void;
  onToggleFeatured: (id: string) => void;
}) {
  return (
    <article className={`border rounded-lg p-6 bg-white ${
      memory.featured ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900">{memory.authorName || 'Anonymous'}</p>
            <CategoryBadge category={memory.category ?? 'GENERAL'} />
            {memory.isGuestBook && (
              <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                Guest Book
              </span>
            )}
            {memory.featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                ★ Featured
              </span>
            )}
            {/* Phase 10: Stale badge */}
            {memory.stale && <StaleBadge />}
          </div>
          <time className="text-sm text-gray-500">
            {new Date(memory.createdAt).toLocaleDateString('en-AU', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </time>
        </div>
        <StarButton
          featured={memory.featured}
          disabled={togglingFeatured === memory.id}
          onClick={() => onToggleFeatured(memory.id)}
        />
      </div>

      <p className="text-gray-700 whitespace-pre-wrap mb-6 leading-relaxed">{memory.message}</p>

      {memory.media && memory.media.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Attached photos ({memory.media.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {memory.media.map(media => (
              <div key={media.id} className="relative group">
                <img src={getPublicUrl(media.blobKey)} alt="Attachment" className="w-full h-48 object-cover rounded-lg" />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <button onClick={() => onApproveMedia(media.id)} disabled={processingMediaId === media.id} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50">✓</button>
                    <button onClick={() => onRejectMedia(media.id)} disabled={processingMediaId === media.id} className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:opacity-50">✗</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => onApprove(memory.id)} disabled={processingId === memory.id} className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
          {processingId === memory.id ? 'Processing...' : 'Approve All'}
        </button>
        <button onClick={() => onReject(memory.id)} disabled={processingId === memory.id} className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
          {processingId === memory.id ? 'Processing...' : 'Reject All'}
        </button>
      </div>
    </article>
  );
}

// ── Approved card ──────────────────────────────────────────────────────────

function ApprovedCard({
  memory,
  memorialId,
  processingId,
  togglingFeatured,
  onToggleFeatured,
  onUnapprove,
  onReject,
  onVisibleUntilUpdate,
}: {
  memory: Memory;
  memorialId: string;
  processingId: string | null;
  togglingFeatured: string | null;
  onToggleFeatured: (id: string) => void;
  onUnapprove: (id: string) => void;
  onReject: (id: string) => void;
  onVisibleUntilUpdate: (id: string, date: Date | null) => void;
}) {
  const [expanded,      setExpanded]      = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  return (
    <article className={`border rounded-lg bg-white transition-all ${
      memory.featured ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
    }`}>
      {/* Compact header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <StarButton
          featured={memory.featured}
          disabled={togglingFeatured === memory.id}
          onClick={() => onToggleFeatured(memory.id)}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">
              {memory.authorName || 'Anonymous'}
            </p>
            <CategoryBadge category={memory.category ?? 'GENERAL'} />
            {memory.isGuestBook && (
              <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                Guest Book
              </span>
            )}
            {memory.featured && (
              <span className="text-xs text-amber-600 font-medium">★ Featured</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-xs text-gray-400">
              {new Date(memory.createdAt).toLocaleDateString('en-AU', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
              {memory.media && memory.media.length > 0 && (
                <span className="ml-2 text-gray-300">· {memory.media.length} photo{memory.media.length !== 1 ? 's' : ''}</span>
              )}
            </p>
            {/* Gaps: visibleUntil picker */}
            <VisibleUntilPicker
              memoryId={memory.id}
              memorialId={memorialId}
              current={memory.visibleUntil}
              onUpdate={date => onVisibleUntilUpdate(memory.id, date)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition-colors"
          >
            {expanded ? 'Hide' : 'Preview'}
          </button>

          <button
            onClick={() => onUnapprove(memory.id)}
            disabled={processingId === memory.id}
            className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 rounded border border-amber-200 hover:border-amber-300 transition-colors disabled:opacity-50"
          >
            Unpublish
          </button>

          {confirmReject ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Sure?</span>
              <button
                onClick={() => { onReject(memory.id); setConfirmReject(false); }}
                disabled={processingId === memory.id}
                className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded border border-red-200 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmReject(false)}
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReject(true)}
              className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Expandable preview */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {memory.message}
          </p>
          {memory.media && memory.media.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {memory.media.map(media => (
                <img
                  key={media.id}
                  src={getPublicUrl(media.blobKey)}
                  alt="Attachment"
                  className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
