'use client';

// components/slideshow/SlideshowPlayer.tsx
//
// Fullscreen TV/chapel slideshow player.
// - Autoplay approved forTribute photos with Ken Burns CSS transitions
// - Web Audio music (proxied, looped)
// - Keyboard: Space=pause, F=fullscreen, ←/→=prev/next, Esc=exit fullscreen
// - Touch: tap left/right thirds = prev/next, centre = pause
// - Respects prefers-reduced-motion (disables Ken Burns, instant cuts)
// - Dark background, TV-safe colours (nothing pure white or at edge)

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlideshowPhoto {
  id:              string;
  url:             string | null;
  caption:         string | null;
  tributeOrder:    number | null;
  tributeDuration: number | null; // override seconds; null → DEFAULT_DURATION
  uploaderName:    string | null;
}

export interface SlideshowMusic {
  id:              string;
  title:           string;
  artist:          string | null;
  durationSeconds: number;
  audioUrl:        string;
}

interface Props {
  memorialName: string;
  photos:       SlideshowPhoto[];
  music:        SlideshowMusic | null;
  titleCardText?: string | null;
  endCardText?:   string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_DURATION   = 5;    // seconds per photo
const TRANSITION_SECONDS = 1.2;  // cross-fade duration
const KEN_BURNS_SCALE    = 1.08; // subtle zoom amount

// ── Ken Burns keyframe directions (cycle through 4) ──────────────────────────
// We use inline style animation-name referencing injected global keyframes.
const KB_DIRECTIONS = [
  'kb-tl', // top-left → bottom-right
  'kb-tr', // top-right → bottom-left
  'kb-bl', // bottom-left → top-right
  'kb-br', // bottom-right → top-left
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function SlideshowPlayer({
  memorialName,
  photos,
  music,
  titleCardText,
  endCardText,
}: Props) {
  const [current, setCurrent]   = useState(0);
  const [next, setNext]         = useState<number | null>(null);
  const [playing, setPlaying]   = useState(false); // starts on first user gesture or auto
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showCaption, setShowCaption]   = useState(true);
  const [musicReady, setMusicReady]     = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const [kbIndex, setKbIndex]   = useState(0);

  const containerRef  = useRef<HTMLDivElement>(null);
  const audioRef      = useRef<HTMLAudioElement>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Inject Ken Burns keyframes once
  useEffect(() => {
    if (document.getElementById('kb-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'kb-keyframes';
    const s = KEN_BURNS_SCALE;
    style.textContent = `
      @keyframes kb-tl {
        from { transform: scale(1)   translate(0, 0); }
        to   { transform: scale(${s}) translate(2%, 2%); }
      }
      @keyframes kb-tr {
        from { transform: scale(1)   translate(0, 0); }
        to   { transform: scale(${s}) translate(-2%, 2%); }
      }
      @keyframes kb-bl {
        from { transform: scale(1)   translate(0, 0); }
        to   { transform: scale(${s}) translate(2%, -2%); }
      }
      @keyframes kb-br {
        from { transform: scale(1)   translate(0, 0); }
        to   { transform: scale(${s}) translate(-2%, -2%); }
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes fade-out {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Timer management ────────────────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const advance = useCallback((dir: 1 | -1 = 1) => {
    if (photos.length === 0) return;
    clearTimer();
    setCurrent(prev => (prev + dir + photos.length) % photos.length);
    setKbIndex(i => (i + 1) % KB_DIRECTIONS.length);
  }, [photos.length, clearTimer]);

  // Schedule next advance when playing
  useEffect(() => {
    if (!playing || photos.length === 0) return;
    const photo    = photos[current];
    const duration = (photo.tributeDuration ?? DEFAULT_DURATION) * 1000;
    timerRef.current = setTimeout(() => advance(1), duration);
    return clearTimer;
  }, [playing, current, photos, advance, clearTimer]);

  // ── Audio ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !music) return;
    audio.src  = music.audioUrl;
    audio.loop = true;
    audio.load();
    const onReady = () => setMusicReady(true);
    audio.addEventListener('canplaythrough', onReady);
    return () => audio.removeEventListener('canplaythrough', onReady);
  }, [music]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !music) return;
    if (playing) {
      audio.play().catch(() => {/* autoplay blocked — user must interact */});
    } else {
      audio.pause();
    }
  }, [playing, music]);

  // ── Fullscreen ──────────────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Controls auto-hide ──────────────────────────────────────────────────────

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [resetControlsTimer]);

  // ── Keyboard ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      resetControlsTimer();
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          setPlaying(p => !p);
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          advance(1);
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          advance(-1);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
          setShowCaption(p => !p);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, toggleFullscreen, resetControlsTimer]);

  // ── Touch ───────────────────────────────────────────────────────────────────

  const handleTouch = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    resetControlsTimer();
    const x     = e.changedTouches[0].clientX;
    const width = window.innerWidth;
    if (x < width * 0.3) {
      advance(-1);
    } else if (x > width * 0.7) {
      advance(1);
    } else {
      setPlaying(p => !p);
    }
  }, [advance, resetControlsTimer]);

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (photos.length === 0) {
    return (
      <div style={styles.emptyWrap}>
        <div style={styles.emptyBox}>
          <p style={styles.emptyTitle}>No photos in slideshow</p>
          <p style={styles.emptyBody}>
            Mark photos as "For Tribute" in the Collection workspace, then return here.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const photo      = photos[current];
  const kbName     = KB_DIRECTIONS[kbIndex % KB_DIRECTIONS.length];
  const photoDur   = (photo.tributeDuration ?? DEFAULT_DURATION);
  const useKB      = !reducedMotion;

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onMouseMove={resetControlsTimer}
      onTouchEnd={handleTouch}
    >
      {/* ── Photo layer ── */}
      {photos.map((p, i) => {
        const isActive = i === current;
        return (
          <div
            key={p.id}
            style={{
              ...styles.slide,
              opacity: isActive ? 1 : 0,
              transition: reducedMotion
                ? 'none'
                : `opacity ${TRANSITION_SECONDS}s ease-in-out`,
              zIndex: isActive ? 1 : 0,
            }}
          >
            {p.url && (
              <div
                style={{
                  ...styles.imgWrap,
                  animationName:          isActive && useKB ? kbName : 'none',
                  animationDuration:      `${photoDur + TRANSITION_SECONDS}s`,
                  animationTimingFunction: 'ease-in-out',
                  animationFillMode:      'both',
                  animationPlayState:     playing && isActive ? 'running' : 'paused',
                }}
              >
                <img
                  src={p.url}
                  alt={p.caption ?? ''}
                  style={styles.img}
                  draggable={false}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* ── Gradient overlays (TV-safe: keep content off edges) ── */}
      <div style={styles.gradTop}    aria-hidden />
      <div style={styles.gradBottom} aria-hidden />

      {/* ── Caption ── */}
      {showCaption && photo.caption && (
        <div style={styles.caption}>
          <p style={styles.captionText}>{photo.caption}</p>
          {photo.uploaderName && (
            <p style={styles.captionSub}>— {photo.uploaderName}</p>
          )}
        </div>
      )}

      {/* ── Progress dots ── */}
      <div style={styles.dots} aria-hidden>
        {photos.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); resetControlsTimer(); }}
            style={{
              ...styles.dot,
              opacity:    i === current ? 1 : 0.35,
              transform:  i === current ? 'scale(1.4)' : 'scale(1)',
              background: i === current ? '#cdba93' : '#fff',
            }}
            aria-label={`Photo ${i + 1}`}
          />
        ))}
      </div>

      {/* ── Controls overlay (auto-hides) ── */}
      <div
        style={{
          ...styles.controls,
          opacity:    showControls ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Top bar */}
        <div style={styles.topBar}>
          <span style={styles.memorialName}>{memorialName}</span>
          {music && (
            <span style={styles.musicLabel}>
              ♪ {music.title}{music.artist ? ` — ${music.artist}` : ''}
            </span>
          )}
        </div>

        {/* Centre play/pause */}
        <button
          onClick={() => { setPlaying(p => !p); resetControlsTimer(); }}
          style={styles.playBtn}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        {/* Bottom bar */}
        <div style={styles.bottomBar}>
          <button onClick={() => advance(-1)} style={styles.navBtn} aria-label="Previous">‹</button>

          <span style={styles.counter}>{current + 1} / {photos.length}</span>

          <button onClick={() => advance(1)} style={styles.navBtn} aria-label="Next">›</button>

          <button
            onClick={() => setShowCaption(p => !p)}
            style={{ ...styles.iconBtn, opacity: showCaption ? 1 : 0.4 }}
            aria-label="Toggle caption"
            title="Toggle caption (C)"
          >
            CC
          </button>

          <button
            onClick={toggleFullscreen}
            style={styles.iconBtn}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title="Fullscreen (F)"
          >
            {fullscreen ? '⊡' : '⛶'}
          </button>
        </div>
      </div>

      {/* ── Pause indicator ── */}
      {!playing && (
        <div style={styles.pausedBadge} aria-live="polite">
          PAUSED — press Space or tap centre to resume
        </div>
      )}

      {/* ── Keyboard hint (first 4 s) ── */}

      {/* ── Hidden audio element ── */}
      {music && <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// All colours pulled from Absolute Posterity's brand tokens: #cdba93 gold, #4f5d75 navy.
// TV-safe: nothing sits within 5% of the viewport edge, pure white avoided.

const styles: Record<string, React.CSSProperties> = {
  container: {
    position:        'fixed',
    inset:           0,
    background:      '#4f5d75',
    overflow:        'hidden',
    cursor:          'none',
    userSelect:      'none',
    WebkitUserSelect: 'none',
  },
  slide: {
    position: 'absolute',
    inset:    0,
  },
  imgWrap: {
    position:    'absolute',
    inset:       '-5%', // extra room for Ken Burns zoom
    transformOrigin: 'center center',
  },
  img: {
    width:      '100%',
    height:     '100%',
    objectFit:  'cover',
    display:    'block',
  },
  gradTop: {
    position:   'absolute',
    top:        0,
    left:       0,
    right:      0,
    height:     '22%',
    background: 'linear-gradient(to bottom, rgba(10,10,22,0.75) 0%, transparent 100%)',
    zIndex:     2,
    pointerEvents: 'none',
  },
  gradBottom: {
    position:   'absolute',
    bottom:     0,
    left:       0,
    right:      0,
    height:     '30%',
    background: 'linear-gradient(to top, rgba(10,10,22,0.85) 0%, transparent 100%)',
    zIndex:     2,
    pointerEvents: 'none',
  },
  caption: {
    position:  'absolute',
    bottom:    '13%',
    left:      '7%',
    right:     '7%',
    zIndex:    4,
    textAlign: 'center',
  },
  captionText: {
    margin:      0,
    color:       '#f0ece4',
    fontSize:    'clamp(1rem, 2.2vw, 1.6rem)',
    fontFamily:  '"Georgia", "Times New Roman", serif',
    fontStyle:   'italic',
    lineHeight:  1.5,
    textShadow:  '0 2px 8px rgba(0,0,0,0.8)',
    letterSpacing: '0.01em',
  },
  captionSub: {
    margin:     '0.4em 0 0',
    color:      '#cdba93',
    fontSize:   'clamp(0.75rem, 1.4vw, 1rem)',
    fontFamily: '"Georgia", serif',
    fontStyle:  'normal',
    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
  },
  dots: {
    position:       'absolute',
    bottom:         '6%',
    left:           '50%',
    transform:      'translateX(-50%)',
    display:        'flex',
    gap:            '8px',
    zIndex:         5,
    flexWrap:       'wrap',
    justifyContent: 'center',
    maxWidth:       '80vw',
  },
  dot: {
    width:         '8px',
    height:        '8px',
    borderRadius:  '50%',
    border:        'none',
    cursor:        'pointer',
    transition:    'opacity 0.3s, transform 0.3s, background 0.3s',
    padding:       0,
  },
  controls: {
    position:      'absolute',
    inset:         0,
    zIndex:        10,
    display:       'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding:       '4% 5%',
  },
  topBar: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    gap:            '1rem',
  },
  memorialName: {
    color:       '#f0ece4',
    fontSize:    'clamp(0.85rem, 1.8vw, 1.2rem)',
    fontFamily:  '"Georgia", serif',
    fontStyle:   'italic',
    textShadow:  '0 1px 6px rgba(0,0,0,0.9)',
    letterSpacing: '0.04em',
  },
  musicLabel: {
    color:       '#cdba93',
    fontSize:    'clamp(0.7rem, 1.2vw, 0.9rem)',
    fontFamily:  'system-ui, sans-serif',
    textShadow:  '0 1px 4px rgba(0,0,0,0.9)',
    textAlign:   'right',
    maxWidth:    '40%',
    lineHeight:  1.4,
  },
  playBtn: {
    alignSelf:       'center',
    background:      'rgba(10,10,22,0.6)',
    border:          '2px solid rgba(201,169,110,0.6)',
    borderRadius:    '50%',
    width:           'clamp(52px, 7vw, 80px)',
    height:          'clamp(52px, 7vw, 80px)',
    color:           '#f0ece4',
    fontSize:        'clamp(1.2rem, 2.5vw, 2rem)',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    transition:      'background 0.2s, border-color 0.2s',
    backdropFilter:  'blur(4px)',
  },
  bottomBar: {
    display:    'flex',
    alignItems: 'center',
    gap:        '1rem',
    justifyContent: 'center',
  },
  navBtn: {
    background:  'none',
    border:      'none',
    color:       '#f0ece4',
    fontSize:    'clamp(1.8rem, 4vw, 3rem)',
    cursor:      'pointer',
    lineHeight:  1,
    padding:     '0 0.2em',
    textShadow:  '0 2px 6px rgba(0,0,0,0.8)',
  },
  counter: {
    color:       '#cdba93',
    fontSize:    'clamp(0.75rem, 1.4vw, 1rem)',
    fontFamily:  'system-ui, monospace',
    minWidth:    '4em',
    textAlign:   'center',
    textShadow:  '0 1px 4px rgba(0,0,0,0.9)',
  },
  iconBtn: {
    background:  'rgba(10,10,22,0.5)',
    border:      '1px solid rgba(240,236,228,0.25)',
    borderRadius: '4px',
    color:       '#f0ece4',
    fontSize:    'clamp(0.65rem, 1.1vw, 0.85rem)',
    cursor:      'pointer',
    padding:     '0.3em 0.6em',
    fontFamily:  'system-ui, sans-serif',
    letterSpacing: '0.05em',
    backdropFilter: 'blur(4px)',
  },
  pausedBadge: {
    position:    'absolute',
    top:         '50%',
    left:        '50%',
    transform:   'translate(-50%, -50%)',
    marginTop:   '5vw',
    color:       'rgba(240,236,228,0.55)',
    fontSize:    'clamp(0.65rem, 1.2vw, 0.85rem)',
    fontFamily:  'system-ui, sans-serif',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    textAlign:   'center',
    pointerEvents: 'none',
    zIndex:      6,
    textShadow:  '0 1px 4px rgba(0,0,0,0.9)',
  },
  emptyWrap: {
    position:       'fixed',
    inset:          0,
    background:     '#4f5d75',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyBox: {
    textAlign: 'center',
    padding:   '3rem',
  },
  emptyTitle: {
    margin:      0,
    color:       '#f0ece4',
    fontSize:    '1.4rem',
    fontFamily:  '"Georgia", serif',
    fontStyle:   'italic',
    marginBottom: '0.75rem',
  },
  emptyBody: {
    margin:     0,
    color:      'rgba(240,236,228,0.5)',
    fontSize:   '0.9rem',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1.6,
    maxWidth:   '30ch',
  },
};
