'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────

interface Memorial {
  id:             string;
  title:          string;
  firstName:      string | null;
  lastName:       string | null;
  description:    string | null;
  birthDate:      string | null;
  deathDate:      string | null;
  workflowStage:  string;
  publishedAt:    string | null;
  primaryColor:   string;
  backgroundColor: string;
  showTimeline:   boolean;
  showGallery:    boolean;
  showGuestBook:  boolean;
  showMemoryCount: boolean;
  guestBookTitle: string;
}

interface Memory {
  id:             string;
  authorName:     string | null;
  message:        string;
  createdAt:      string;
  featured:       boolean;
  category:       string;
  media:          { id: string; blobKey: string; mimeType: string; url: string }[];
  reactionCounts: Record<string, number>;
}

interface GuestEntry {
  id:         string;
  authorName: string | null;
  message:    string;
  createdAt:  string;
}

interface MediaItem {
  id:          string;
  blobKey:     string;
  mimeType:    string;
  url:         string;
  memoryAuthor: string | null;
}

interface Checklist {
  hasName:        boolean;
  hasDates:       boolean;
  hasDescription: boolean;
  hasMemories:    boolean;
  hasMedia:       boolean;
  noUnsorted:     boolean;
}

interface Props {
  memorial:           Memorial;
  memories:           Memory[];
  guestBookEntries:   GuestEntry[];
  allMedia:           MediaItem[];
  checklist:          Checklist;
  checklistPassed:    number;
  checklistTotal:     number;
  canPublish:         boolean;
  collectionApproved: number;
  collectionUnsorted: number;
}

// ── Checklist item ─────────────────────────────────────────────────────────

function CheckItem({ label, passed, hint }: { label: string; passed: boolean; hint?: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid var(--ivory-mid)' }}>
      <span style={{ fontSize: '0.9rem', marginTop: 1, flexShrink: 0 }}>{passed ? '✅' : '⬜'}</span>
      <div>
        <p style={{ margin: 0, fontSize: '0.8rem', fontFamily: 'var(--font-body)', color: passed ? 'var(--ink)' : 'var(--ash)', fontWeight: passed ? 500 : 400 }}>
          {label}
        </p>
        {!passed && hint && (
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)' }}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Memory card (simplified preview) ──────────────────────────────────────

function PreviewMemoryCard({ memory, primaryColor }: { memory: Memory; primaryColor: string }) {
  return (
    <article style={{
      background: '#fff', borderRadius: 16, padding: '1.5rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: '1rem',
      borderTop: `2px solid ${primaryColor}22`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: `${primaryColor}cc`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
        }}>
          {(memory.authorName ?? '?')[0].toUpperCase()}
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#111', fontFamily: 'Georgia, serif' }}>
            {memory.authorName ?? 'Anonymous'}
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>
            {new Date(memory.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        {memory.featured && (
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 600, color: '#cdba93', background: '#fef3c7', padding: '0.15rem 0.55rem', borderRadius: 999 }}>
            Featured
          </span>
        )}
      </div>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#374151', fontFamily: 'Georgia, serif', margin: 0 }}>
        {memory.message}
      </p>
      {memory.media.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: '1rem' }}>
          {memory.media.map(m => (
            <div key={m.id} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}>
              {m.mimeType.startsWith('image/') && (
                <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function PreviewWorkspace({
  memorial, memories, guestBookEntries, allMedia,
  checklist, checklistPassed, checklistTotal, canPublish,
  collectionApproved, collectionUnsorted,
}: Props) {
  const router  = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [published,  setPublished]  = useState(memorial.workflowStage === 'LIVE');
  const [showChecklist, setShowChecklist] = useState(true);

  async function handlePublish() {
    if (!canPublish) return;
    if (!confirm('Publish this memorial? It will become visible to the public.')) return;
    setPublishing(true);
    const res = await fetch(`/api/memorial/${memorial.id}/publish`, { method: 'POST' });
    if (res.ok) {
      setPublished(true);
      router.refresh();
    } else {
      alert('Failed to publish. Please try again.');
    }
    setPublishing(false);
  }

  const isLive = published || memorial.workflowStage === 'LIVE';

  return (
    <div style={{ minHeight: '100vh', background: memorial.backgroundColor }}>

      {/* ── Sticky preview banner ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#4f5d75', borderBottom: '2px solid #cdba93',
        padding: '0.65rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <span style={{
            fontSize: '0.62rem', letterSpacing: '0.2em', fontWeight: 700,
            color: '#cdba93', fontFamily: 'var(--font-body)', textTransform: 'uppercase',
          }}>
            {isLive ? '🟢 Live' : '👁 Preview Mode'}
          </span>
          <span style={{ fontSize: '0.78rem', color: '#98a2b3', fontFamily: 'var(--font-body)' }}>
            {isLive ? 'This memorial is now public.' : 'Not visible to the public yet.'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowChecklist(s => !s)}
            style={{
              fontSize: '0.75rem', padding: '0.35rem 0.85rem', borderRadius: 6,
              border: '1px solid #98a2b3', background: 'transparent', color: '#f4f1ea',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            {showChecklist ? 'Hide' : 'Show'} Checklist ({checklistPassed}/{checklistTotal})
          </button>

          <Link
            href={`/dashboard/memorial/${memorial.id}/collection`}
            style={{
              fontSize: '0.75rem', padding: '0.35rem 0.85rem', borderRadius: 6,
              border: '1px solid #98a2b3', background: 'transparent', color: '#f4f1ea',
              textDecoration: 'none', fontFamily: 'var(--font-body)',
            }}
          >
            ← Edit Content
          </Link>

          {!isLive && (
            <button
              onClick={handlePublish}
              disabled={!canPublish || publishing}
              style={{
                fontSize: '0.78rem', padding: '0.4rem 1.1rem', borderRadius: 6,
                border: 'none', cursor: canPublish ? 'pointer' : 'not-allowed',
                background: canPublish ? '#cdba93' : '#4a4a5a', color: '#4f5d75',
                fontWeight: 700, fontFamily: 'var(--font-body)',
                opacity: publishing ? 0.7 : 1,
              }}
            >
              {publishing ? 'Publishing…' : canPublish ? 'Publish Memorial' : 'Complete Checklist First'}
            </button>
          )}

          {isLive && (
            <Link
              href={`/dashboard/memorial/${memorial.id}/settings`}
              style={{
                fontSize: '0.75rem', padding: '0.35rem 0.85rem', borderRadius: 6,
                border: '1px solid #cdba93', background: 'transparent', color: '#cdba93',
                textDecoration: 'none', fontFamily: 'var(--font-body)',
              }}
            >
              Manage →
            </Link>
          )}
        </div>
      </div>

      {/* ── Layout: checklist sidebar + memorial content ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* Checklist sidebar */}
        {showChecklist && (
          <div style={{
            width: 280, flexShrink: 0, position: 'sticky', top: 52,
            maxHeight: 'calc(100vh - 52px)', overflowY: 'auto',
            background: '#fff', borderRight: '1px solid var(--ivory-mid)',
            padding: '1.25rem',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 500, color: 'var(--ink)', marginBottom: '0.25rem' }}>
              Publish Checklist
            </h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', marginBottom: '1rem' }}>
              {checklistPassed}/{checklistTotal} complete
            </p>

            {/* Progress bar */}
            <div style={{ height: 4, background: 'var(--ivory-mid)', borderRadius: 999, marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: `${(checklistPassed / checklistTotal) * 100}%`,
                background: checklistPassed === checklistTotal ? '#065F46' : '#cdba93',
                transition: 'width 0.3s',
              }} />
            </div>

            <CheckItem label="Memorial has a name"        passed={checklist.hasName}        hint="Add a first or last name in Settings" />
            <CheckItem label="Dates added"                passed={checklist.hasDates}        hint="Add birth and death dates in Settings" />
            <CheckItem label="Description / bio written"  passed={checklist.hasDescription}  hint="Add a description in Settings" />
            <CheckItem label="At least one memory"        passed={checklist.hasMemories}     hint="Approve a collection item or wait for public submissions" />
            <CheckItem label="At least one photo"         passed={checklist.hasMedia}        hint="Approve a photo in the Collection workspace" />
            <CheckItem label="No unsorted content"        passed={checklist.noUnsorted}      hint={`${collectionUnsorted} item${collectionUnsorted !== 1 ? 's' : ''} still unsorted`} />

            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--ivory)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
              <strong>Minimum to publish:</strong> name + at least one memory.
              All other items are recommended but optional.
            </div>

            {collectionApproved > 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: '#D1FAE5', borderRadius: 8, fontSize: '0.72rem', color: '#065F46', fontFamily: 'var(--font-body)' }}>
                ✓ {collectionApproved} collection item{collectionApproved !== 1 ? 's' : ''} published as memories
              </div>
            )}
          </div>
        )}

        {/* Memorial content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Top bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${memorial.primaryColor}, transparent)`, opacity: 0.8 }} />

          {/* Hero */}
          <div style={{ maxWidth: 780, margin: '0 auto', padding: '5rem 2.5rem 4rem' }}>
            <p style={{ fontSize: '0.62rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: memorial.primaryColor, opacity: 0.8, marginBottom: '1.5rem', fontFamily: 'Lora, Georgia, serif' }}>
              In Loving Memory
            </p>
            <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(2.75rem, 6vw, 4.5rem)', fontWeight: 400, lineHeight: 1.05, color: '#1a1714', marginBottom: 0 }}>
              {memorial.title}
            </h1>

            {(memorial.birthDate || memorial.deathDate) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', color: memorial.primaryColor, fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.05rem', fontStyle: 'italic' }}>
                {memorial.birthDate && <span>{memorial.birthDate}</span>}
                {memorial.birthDate && memorial.deathDate && <span style={{ opacity: 0.3, fontSize: '1.25rem', fontStyle: 'normal' }}>—</span>}
                {memorial.deathDate && <span>{memorial.deathDate}</span>}
              </div>
            )}

            <div style={{ width: 40, height: 1, background: memorial.primaryColor, opacity: 0.5, margin: '1.75rem 0' }} />

            {memorial.description && (
              <p style={{ fontFamily: 'Crimson Pro, Georgia, serif', fontSize: '1.1rem', lineHeight: 1.9, color: '#5a534e', maxWidth: 560, fontStyle: 'italic' }}>
                "{memorial.description}"
              </p>
            )}

            {memorial.showMemoryCount && (memories.length > 0 || allMedia.length > 0) && (
              <div style={{ display: 'flex', gap: 0, marginTop: '2.5rem', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
                {memories.length > 0 && (
                  <div style={{ padding: '0.8rem 1.5rem', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
                    <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.75rem', fontWeight: 600, color: memorial.primaryColor, lineHeight: 1 }}>{memories.length}</div>
                    <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9a9188', marginTop: '0.2rem' }}>Memories</div>
                  </div>
                )}
                {allMedia.length > 0 && (
                  <div style={{ padding: '0.8rem 1.5rem' }}>
                    <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.75rem', fontWeight: 600, color: memorial.primaryColor, lineHeight: 1 }}>{allMedia.length}</div>
                    <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9a9188', marginTop: '0.2rem' }}>Photos</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Memories */}
          <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 2.5rem 6rem' }}>
            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(0,0,0,0.12), transparent)', marginBottom: '2.5rem' }} />

            {memories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 16, border: '2px dashed var(--ivory-mid)' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</p>
                <p style={{ fontFamily: 'var(--font-body)', color: 'var(--ash)', fontSize: '0.9rem' }}>
                  No approved memories yet. Go to the{' '}
                  <Link href={`/dashboard/memorial/${memorial.id}/collection`} style={{ color: memorial.primaryColor }}>
                    Collection workspace
                  </Link>
                  {' '}to approve content.
                </p>
              </div>
            ) : (
              memories.map(m => (
                <PreviewMemoryCard key={m.id} memory={m} primaryColor={memorial.primaryColor} />
              ))
            )}

            {/* Guest book preview */}
            {memorial.showGuestBook && guestBookEntries.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.5rem', fontWeight: 400, color: '#1a1714', marginBottom: '1rem' }}>
                  {memorial.guestBookTitle}
                </h2>
                {guestBookEntries.map(g => (
                  <div key={g.id} style={{ background: '#fff', borderRadius: 12, padding: '1.25rem', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: '#111', fontFamily: 'Georgia, serif' }}>{g.authorName ?? 'Anonymous'}</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: '#374151', fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>{g.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
