// app/dashboard/memorial/[memorialId]/slideshow/page.tsx
//
// Dashboard launcher for the Tribute Slideshow feature.
// Shows:
//   - Feature-disabled notice (if featureSlideshow = false on the org)
//   - Photo count + music track in use (reused from TributeVideo config)
//   - "Open Slideshow" button → /slideshow/[memorialId] in a new tab
//   - Keyboard shortcut hints
//   - Link back to Collection workspace to mark photos forTribute
//
// NO new config here — photos are managed in Collection, music via TributeVideo.
// This keeps Phase 3 strictly additive and avoids duplicating config surfaces.

import { redirect, notFound } from 'next/navigation';
import { auth }               from '@clerk/nextjs/server';
import { prisma }             from '@/lib/prisma';
import Link                   from 'next/link';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface Props {
  params: { memorialId: string };
}

export default async function SlideshowDashboardPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // FIXED: previously a manual `ownerId !== userId` check, which blocked
  // every org staff member except the literal creator. This is a
  // read-only launcher page, so 'read' is the right permission level.
  try {
    await assertMemorialAccess(params.memorialId, userId, 'read');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: params.memorialId },
    select: {
      id:            true,
      title:         true,
      firstName:     true,
      lastName:      true,
      preferredName: true,
      organisation: {
        select: { featureSlideshow: true },
      },
      tributeVideo: {
        select: {
          musicTrack: {
            select: { title: true, artist: true },
          },
        },
      },
    },
  });

  if (!memorial) notFound();

  const featureEnabled = memorial.organisation?.featureSlideshow ?? false;

  const displayName =
    memorial.preferredName ||
    [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') ||
    memorial.title ||
    'This Memorial';

  // Count approved forTribute photos
  const photoCount = await prisma.collectionItem.count({
    where: {
      memorialId: params.memorialId,
      type:       'PHOTO',
      forTribute: true,
      status:     'APPROVED',
    },
  });

  const track = memorial.tributeVideo?.musicTrack ?? null;
  const slideshowUrl = `/slideshow/${params.memorialId}`;

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <div style={styles.iconWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a96e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
              <polygon points="10,8 16,11 10,14" fill="#c9a96e" stroke="none"/>
            </svg>
          </div>
          <div>
            <h1 style={styles.title}>Tribute Slideshow</h1>
            <p style={styles.subtitle}>{displayName}</p>
          </div>
        </div>

        {/* ── Feature disabled notice ── */}
        {!featureEnabled && (
          <div style={styles.notice}>
            <p style={styles.noticeText}>
              The Slideshow feature is not enabled for your organisation.
              Contact support or enable it in Organisation Settings to use this feature.
            </p>
          </div>
        )}

        {/* ── Stats row ── */}
        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <span style={styles.statNum}>{photoCount}</span>
            <span style={styles.statLabel}>
              {photoCount === 1 ? 'Photo' : 'Photos'} in slideshow
            </span>
          </div>
          <div style={styles.statDivider} />
          <div style={styles.stat}>
            {track ? (
              <>
                <span style={styles.statNum}>♪</span>
                <span style={styles.statLabel}>
                  {track.title}{track.artist ? ` — ${track.artist}` : ''}
                </span>
              </>
            ) : (
              <>
                <span style={{ ...styles.statNum, color: 'rgba(10,10,22,0.3)' }}>—</span>
                <span style={styles.statLabel}>No music selected</span>
              </>
            )}
          </div>
        </div>

        {/* ── Empty photo warning ── */}
        {photoCount === 0 && featureEnabled && (
          <div style={styles.warning}>
            <p style={styles.warningText}>
              No photos are marked for this slideshow yet.
              Go to the Collection workspace and mark photos as "For Tribute" to include them.
            </p>
            <Link
              href={`/dashboard/memorial/${params.memorialId}/collection`}
              style={styles.linkBtn}
            >
              Open Collection →
            </Link>
          </div>
        )}

        {/* ── Primary action ── */}
        {featureEnabled && photoCount > 0 && (
          <a
            href={slideshowUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.openBtn}
          >
            Open Slideshow ↗
          </a>
        )}

        {/* ── Keyboard hints ── */}
        {featureEnabled && (
          <div style={styles.hints}>
            <p style={styles.hintsHeading}>Keyboard shortcuts</p>
            <div style={styles.hintGrid}>
              {[
                ['Space', 'Play / Pause'],
                ['← →',  'Previous / Next'],
                ['F',    'Toggle fullscreen'],
                ['C',    'Toggle captions'],
              ].map(([key, label]) => (
                <div key={key} style={styles.hintRow}>
                  <kbd style={styles.kbd}>{key}</kbd>
                  <span style={styles.hintLabel}>{label}</span>
                </div>
              ))}
            </div>
            <p style={styles.touchHint}>
              On touch screens: tap left/right edges to navigate, tap centre to pause.
            </p>
          </div>
        )}

        {/* ── Footer links ── */}
        <div style={styles.footer}>
          <Link
            href={`/dashboard/memorial/${params.memorialId}/collection`}
            style={styles.footerLink}
          >
            ← Manage photos (Collection)
          </Link>
          <Link
            href={`/dashboard/memorial/${params.memorialId}/video`}
            style={styles.footerLink}
          >
            ← Change music (Tribute Video)
          </Link>
        </div>

      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight:       '100vh',
    background:      '#f7f5f2',
    display:         'flex',
    alignItems:      'flex-start',
    justifyContent:  'center',
    padding:         '3rem 1rem',
  },
  card: {
    background:   '#ffffff',
    borderRadius: '12px',
    boxShadow:    '0 2px 16px rgba(10,10,22,0.08)',
    padding:      '2.5rem',
    width:        '100%',
    maxWidth:     '560px',
  },
  header: {
    display:     'flex',
    alignItems:  'center',
    gap:         '1rem',
    marginBottom: '2rem',
  },
  iconWrap: {
    width:           '52px',
    height:          '52px',
    background:      '#0a0a16',
    borderRadius:    '10px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  title: {
    margin:      0,
    fontSize:    '1.3rem',
    fontWeight:  600,
    color:       '#0a0a16',
    fontFamily:  'system-ui, sans-serif',
    lineHeight:  1.2,
  },
  subtitle: {
    margin:     '0.2rem 0 0',
    fontSize:   '0.85rem',
    color:      'rgba(10,10,22,0.5)',
    fontFamily: 'system-ui, sans-serif',
  },
  notice: {
    background:   'rgba(10,10,22,0.04)',
    border:       '1px solid rgba(10,10,22,0.12)',
    borderRadius: '8px',
    padding:      '1rem 1.25rem',
    marginBottom: '1.5rem',
  },
  noticeText: {
    margin:     0,
    fontSize:   '0.875rem',
    color:      'rgba(10,10,22,0.65)',
    lineHeight: 1.6,
    fontFamily: 'system-ui, sans-serif',
  },
  statsRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          '1.5rem',
    background:   '#f7f5f2',
    borderRadius: '8px',
    padding:      '1.25rem 1.5rem',
    marginBottom: '1.5rem',
  },
  stat: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0.2rem',
    flex:          1,
  },
  statNum: {
    fontSize:   '1.5rem',
    fontWeight: 700,
    color:      '#0a0a16',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1,
  },
  statLabel: {
    fontSize:   '0.78rem',
    color:      'rgba(10,10,22,0.5)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.4,
  },
  statDivider: {
    width:      '1px',
    height:     '40px',
    background: 'rgba(10,10,22,0.1)',
    flexShrink: 0,
  },
  warning: {
    background:   'rgba(201,169,110,0.08)',
    border:       '1px solid rgba(201,169,110,0.3)',
    borderRadius: '8px',
    padding:      '1rem 1.25rem',
    marginBottom: '1.5rem',
  },
  warningText: {
    margin:     '0 0 0.75rem',
    fontSize:   '0.875rem',
    color:      'rgba(10,10,22,0.7)',
    lineHeight: 1.6,
    fontFamily: 'system-ui, sans-serif',
  },
  linkBtn: {
    color:          '#c9a96e',
    fontSize:       '0.85rem',
    fontFamily:     'system-ui, sans-serif',
    fontWeight:     600,
    textDecoration: 'none',
  },
  openBtn: {
    display:         'block',
    width:           '100%',
    background:      '#0a0a16',
    color:           '#f0ece4',
    border:          'none',
    borderRadius:    '8px',
    padding:         '0.9rem 1.5rem',
    fontSize:        '1rem',
    fontWeight:      600,
    fontFamily:      'system-ui, sans-serif',
    cursor:          'pointer',
    textDecoration:  'none',
    textAlign:       'center',
    marginBottom:    '2rem',
    letterSpacing:   '0.02em',
    transition:      'background 0.2s',
  },
  hints: {
    borderTop:   '1px solid rgba(10,10,22,0.08)',
    paddingTop:  '1.5rem',
    marginBottom: '1.5rem',
  },
  hintsHeading: {
    margin:       '0 0 0.75rem',
    fontSize:     '0.75rem',
    fontWeight:   600,
    color:        'rgba(10,10,22,0.4)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontFamily:   'system-ui, sans-serif',
  },
  hintGrid: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '0.5rem 1.5rem',
    marginBottom:        '0.75rem',
  },
  hintRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.5rem',
  },
  kbd: {
    background:   '#f7f5f2',
    border:       '1px solid rgba(10,10,22,0.15)',
    borderRadius: '4px',
    padding:      '0.15em 0.45em',
    fontSize:     '0.75rem',
    fontFamily:   'monospace',
    color:        '#0a0a16',
    whiteSpace:   'nowrap',
    flexShrink:   0,
  },
  hintLabel: {
    fontSize:   '0.8rem',
    color:      'rgba(10,10,22,0.6)',
    fontFamily: 'system-ui, sans-serif',
  },
  touchHint: {
    margin:     0,
    fontSize:   '0.78rem',
    color:      'rgba(10,10,22,0.4)',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.5,
  },
  footer: {
    display:        'flex',
    flexDirection:  'column',
    gap:            '0.5rem',
    borderTop:      '1px solid rgba(10,10,22,0.08)',
    paddingTop:     '1.25rem',
  },
  footerLink: {
    color:          'rgba(10,10,22,0.45)',
    fontSize:       '0.82rem',
    fontFamily:     'system-ui, sans-serif',
    textDecoration: 'none',
  },
};
