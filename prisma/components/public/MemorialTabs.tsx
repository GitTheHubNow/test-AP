'use client';

import { useState, useEffect, useRef } from 'react';
import { MemorySubmissionForm } from '@/components/MemorySubmissionForm';
import { ReactionBar } from '@/components/public/ReactionBar';
import { ShareBar } from '@/components/public/ShareBar';
import { useVisitorToken } from '@/hooks/useVisitorToken';
import { usePageView } from '@/hooks/usePageView';

// ── Types ──────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  blobKey: string;
  mimeType: string;
  url: string;
}

interface Memory {
  id: string;
  authorName: string | null;
  message: string;
  createdAt: Date;
  featured: boolean;
  category: string;
  isGuestBook: boolean;
  media: MediaItem[];
  reactionCounts: Record<string, number>;
  myReactions:    string[];
}

interface GuestBookEntry {
  id: string;
  authorName: string | null;
  message: string;
  createdAt: Date;
}

interface GalleryMedia extends MediaItem {
  memoryAuthor: string | null;
  memoryId: string;
}

interface MemorialTabsProps {
  memorialToken:    string;
  memorialTitle:    string; // Phase 9: needed for share text
  memories:         Memory[];
  guestBookEntries: GuestBookEntry[];
  allMedia:         GalleryMedia[];
  readOnly:         boolean;
  showTimeline:     boolean;
  showGallery:      boolean;
  showGuestBook:    boolean;
  guestBookTitle:   string;
  primaryColor:     string;
}

// ── Category config ────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; dot: string }> = {
  GENERAL:    { label: 'Memory',     dot: '#9ca3af' },
  CONDOLENCE: { label: 'Condolence', dot: '#60a5fa' },
  STORY:      { label: 'Story',      dot: '#a78bfa' },
  TRIBUTE:    { label: 'Tribute',    dot: '#f59e0b' },
  GUEST_BOOK: { label: 'Guest Book', dot: '#34d399' },
};

const FILTER_OPTIONS = [
  { value: 'ALL',        label: 'All' },
  { value: 'GENERAL',    label: 'Memories' },
  { value: 'CONDOLENCE', label: 'Condolences' },
  { value: 'STORY',      label: 'Stories' },
  { value: 'TRIBUTE',    label: 'Tributes' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Fade-in hook ───────────────────────────────────────────────────────────

function useFadeIn(delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return { ref, visible };
}

function FadeIn({ children, delay = 0, className = '' }: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useFadeIn(delay);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      {children}
    </div>
  );
}

// ── Category badge ─────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.GENERAL;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 uppercase tracking-widest">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.dot }} />
      {config.label}
    </span>
  );
}

// ── Memory card ────────────────────────────────────────────────────────────

function MemoryCard({
  memory,
  primaryColor,
  delay,
  memorialToken,
  visitorToken,
}: {
  memory: Memory;
  primaryColor: string;
  delay: number;
  memorialToken: string;
  visitorToken: string | null;
}) {
  return (
    <FadeIn delay={delay}>
      <article
        className="relative bg-white rounded-2xl overflow-hidden transition-shadow duration-300 hover:shadow-lg"
        style={{
          boxShadow: memory.featured
            ? `0 2px 16px 0 ${primaryColor}22, 0 1px 3px 0 rgba(0,0,0,0.06)`
            : '0 1px 4px 0 rgba(0,0,0,0.07)',
          ...(memory.featured ? { outline: `1.5px solid ${primaryColor}44` } : {}),
        }}
      >
        {memory.featured && (
          <div className="h-0.5 w-full absolute top-0 left-0" style={{ backgroundColor: primaryColor }} />
        )}

        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold select-none"
                style={{ backgroundColor: primaryColor + 'cc' }}
              >
                {(memory.authorName?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                  {memory.authorName || 'Anonymous'}
                </p>
                <time className="text-xs text-gray-400 tracking-wide">{formatDate(memory.createdAt)}</time>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {memory.featured && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: primaryColor + '18', color: primaryColor }}>
                  ★ Featured
                </span>
              )}
              <CategoryBadge category={memory.category} />
            </div>
          </div>

          <div className="w-8 h-px bg-gray-100 mb-5" />

          <p
            className="text-gray-700 leading-loose whitespace-pre-wrap"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.05rem', lineHeight: '1.9' }}
          >
            {memory.message}
          </p>

          {memory.media.length > 0 && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {memory.media.map(media => (
                <div key={media.id} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <img
                    src={media.url}
                    alt="Memory photo"
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}

          {visitorToken && (
            <ReactionBar
              memoryId={memory.id}
              memorialToken={memorialToken}
              initialCounts={memory.reactionCounts}
              initialMine={memory.myReactions}
              visitorToken={visitorToken}
              primaryColor={primaryColor}
            />
          )}
        </div>
      </article>
    </FadeIn>
  );
}

// ── Gallery ────────────────────────────────────────────────────────────────

function GalleryGrid({ media, primaryColor }: { media: GalleryMedia[]; primaryColor: string }) {
  const [lightbox, setLightbox] = useState<GalleryMedia | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  if (media.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
        <p className="text-gray-400 text-lg" style={{ fontFamily: 'Georgia, serif' }}>No photos have been shared yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {media.map((item, i) => (
          <FadeIn key={item.id} delay={i * 40}>
            <button
              onClick={() => setLightbox(item)}
              className="aspect-square rounded-xl overflow-hidden bg-gray-100 w-full block hover:opacity-90 transition-opacity duration-200 focus:outline-none"
            >
              <img src={item.url} alt={`Photo by ${item.memoryAuthor || 'Anonymous'}`} className="w-full h-full object-cover" loading="lazy" />
            </button>
          </FadeIn>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)' }}
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()} style={{ animation: 'fadeUp 0.25s ease both' }}>
            <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }`}</style>
            <img src={lightbox.url} alt="Photo" className="w-full rounded-2xl shadow-2xl max-h-[82vh] object-contain" />
            {lightbox.memoryAuthor && (
              <p className="mt-4 text-center text-white/60 text-sm tracking-wide">Shared by {lightbox.memoryAuthor}</p>
            )}
            <button onClick={() => setLightbox(null)} className="absolute -top-12 right-0 text-white/50 hover:text-white text-sm tracking-widest uppercase transition-colors">
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Guest book list ────────────────────────────────────────────────────────

function GuestBookList({ entries, primaryColor }: { entries: GuestBookEntry[]; primaryColor: string }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
        <p className="text-gray-400 text-lg" style={{ fontFamily: 'Georgia, serif' }}>No entries yet. Be the first to sign.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <FadeIn key={entry.id} delay={i * 50}>
          <div className="bg-white rounded-2xl px-7 py-5 shadow-sm border-l-[3px] transition-shadow hover:shadow-md" style={{ borderLeftColor: primaryColor }}>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <p className="font-semibold text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>{entry.authorName || 'Anonymous'}</p>
              <time className="text-xs text-gray-400 tracking-wide flex-shrink-0">{formatDate(entry.createdAt)}</time>
            </div>
            <p className="text-gray-600 leading-relaxed" style={{ fontFamily: 'Georgia, serif', lineHeight: '1.75' }}>{entry.message}</p>
          </div>
        </FadeIn>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function MemorialTabs({
  memorialToken,
  memorialTitle,
  memories,
  guestBookEntries,
  allMedia,
  readOnly,
  showTimeline,
  showGallery,
  showGuestBook,
  guestBookTitle,
  primaryColor,
}: MemorialTabsProps) {
  const visitorToken = useVisitorToken();

  // Phase 9: Track page view on mount — fires once, fails silently
  usePageView(memorialToken, visitorToken);

  const tabs = [
    ...(showTimeline ? [{ id: 'memories',  label: 'Memories',                      count: memories.length }] : []),
    ...(showGallery && allMedia.length > 0 ? [{ id: 'gallery', label: 'Gallery',   count: allMedia.length }] : []),
    ...(showGuestBook ? [{ id: 'guestbook', label: guestBookTitle || 'Guest Book', count: guestBookEntries.length }] : []),
  ];

  const [activeTab,       setActiveTab]       = useState(tabs[0]?.id ?? 'memories');
  const [categoryFilter,  setCategoryFilter]  = useState('ALL');

  const filteredMemories = categoryFilter === 'ALL'
    ? memories
    : memories.filter(m => m.category === categoryFilter);

  const presentCategories = [...new Set(memories.map(m => m.category))];
  const showFilter = presentCategories.length > 1;

  return (
    <div>
      {/* ── Share bar — Phase 9 ───────────────────────────────────── */}
      <div className="mb-8 -mx-5 sm:-mx-8">
        <ShareBar memorialTitle={memorialTitle} primaryColor={primaryColor} />
      </div>

      {/* Tab navigation */}
      {tabs.length > 1 && (
        <div className="mb-10">
          <div className="flex border-b border-gray-200">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative px-6 py-3.5 text-sm font-medium transition-colors duration-150 focus:outline-none"
                style={{
                  color:        activeTab === tab.id ? primaryColor : '#6b7280',
                  borderBottom: activeTab === tab.id ? `2px solid ${primaryColor}` : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="ml-2 text-xs rounded-full px-1.5 py-0.5 font-medium"
                    style={{
                      backgroundColor: activeTab === tab.id ? primaryColor + '18' : '#f3f4f6',
                      color:           activeTab === tab.id ? primaryColor : '#9ca3af',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Memories tab */}
      {activeTab === 'memories' && (
        <div className="space-y-6">
          {!readOnly && (
            <FadeIn>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="h-1 w-full" style={{ backgroundColor: primaryColor + '60' }} />
                <div className="p-7">
                  <h2 className="text-xl font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    Share a Memory
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">Your memory will be reviewed before it appears here.</p>
                  <MemorySubmissionForm memorialToken={memorialToken} />
                </div>
              </div>
            </FadeIn>
          )}

          {showFilter && (
            <div className="flex gap-2 flex-wrap">
              {FILTER_OPTIONS.filter(opt => opt.value === 'ALL' || presentCategories.includes(opt.value)).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCategoryFilter(opt.value)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 border"
                  style={
                    categoryFilter === opt.value
                      ? { backgroundColor: primaryColor, color: '#fff', borderColor: primaryColor }
                      : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {filteredMemories.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
              <p className="text-gray-400 text-lg" style={{ fontFamily: 'Georgia, serif' }}>
                {memories.length === 0 ? 'No memories have been shared yet.' : 'No memories in this category.'}
              </p>
              {memories.length === 0 && !readOnly && (
                <p className="text-sm text-gray-300 mt-2">Be the first to share one above.</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {filteredMemories.map((memory, i) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  primaryColor={primaryColor}
                  delay={i * 60}
                  memorialToken={memorialToken}
                  visitorToken={visitorToken}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gallery tab */}
      {activeTab === 'gallery' && (
        <GalleryGrid media={allMedia} primaryColor={primaryColor} />
      )}

      {/* Guest book tab */}
      {activeTab === 'guestbook' && (
        <div className="space-y-6">
          {!readOnly && (
            <FadeIn>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="h-1 w-full" style={{ backgroundColor: primaryColor + '60' }} />
                <div className="p-7">
                  <h2 className="text-xl font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                    Sign the {guestBookTitle || 'Guest Book'}
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">Leave a short message of remembrance.</p>
                  <MemorySubmissionForm memorialToken={memorialToken} guestBookMode={true} />
                </div>
              </div>
            </FadeIn>
          )}
          <GuestBookList entries={guestBookEntries} primaryColor={primaryColor} />
        </div>
      )}
    </div>
  );
}
