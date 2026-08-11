'use client';

// components/slideshow/SlideshowPageClient.tsx
//
// Client wrapper for the slideshow page.
// Fetches /api/memorials/[id]/slideshow and mounts <SlideshowPlayer />.
// Handles loading, feature-flag disabled, and empty-photo states.

import { useEffect, useState } from 'react';
import { SlideshowPlayer, SlideshowPhoto, SlideshowMusic } from './SlideshowPlayer';

interface ApiData {
  photos:        SlideshowPhoto[];
  music:         SlideshowMusic | null;
  titleCardText: string | null;
  endCardText:   string | null;
}

interface Props {
  memorialId:   string;
  memorialName: string;
}

type State =
  | { status: 'loading' }
  | { status: 'error';   message: string }
  | { status: 'ready';   data: ApiData };

export function SlideshowPageClient({ memorialId, memorialName }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/memorials/${memorialId}/slideshow`)
      .then(async res => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          // Surface the API error — could be 403 feature-flag, 404, etc.
          const msg =
            res.status === 403
              ? 'The Slideshow feature is not enabled for your organisation. Enable it in Settings or contact support.'
              : json.error ?? `Error ${res.status}`;
          setState({ status: 'error', message: msg });
        } else {
          setState({ status: 'ready', data: json.data });
        }
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', message: err.message ?? 'Network error' });
      });

    return () => { cancelled = true; };
  }, [memorialId]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <div style={shell}>
        <div style={centred}>
          <div style={spinner} />
          <p style={hint}>Loading slideshow…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div style={shell}>
        <div style={centred}>
          <p style={errorTitle}>Slideshow unavailable</p>
          <p style={errorBody}>{state.message}</p>
          <a href="javascript:history.back()" style={backLink}>← Back to dashboard</a>
        </div>
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  return (
    <SlideshowPlayer
      memorialName={memorialName}
      photos={state.data.photos}
      music={state.data.music}
      titleCardText={state.data.titleCardText}
      endCardText={state.data.endCardText}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  position:        'fixed',
  inset:           0,
  background:      '#0a0a16',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  fontFamily:      'system-ui, sans-serif',
};

const centred: React.CSSProperties = {
  textAlign: 'center',
  padding:   '2rem',
};

const spinner: React.CSSProperties = {
  width:         '40px',
  height:        '40px',
  border:        '3px solid rgba(201,169,110,0.2)',
  borderTop:     '3px solid #c9a96e',
  borderRadius:  '50%',
  animation:     'spin 0.9s linear infinite',
  margin:        '0 auto 1.5rem',
};

const hint: React.CSSProperties = {
  color:       'rgba(240,236,228,0.45)',
  fontSize:    '0.85rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin:      0,
};

const errorTitle: React.CSSProperties = {
  color:       '#f0ece4',
  fontSize:    '1.3rem',
  fontFamily:  '"Georgia", serif',
  fontStyle:   'italic',
  margin:      '0 0 0.75rem',
};

const errorBody: React.CSSProperties = {
  color:       'rgba(240,236,228,0.6)',
  fontSize:    '0.9rem',
  lineHeight:  1.6,
  maxWidth:    '34ch',
  margin:      '0 auto 1.5rem',
};

const backLink: React.CSSProperties = {
  color:          '#c9a96e',
  fontSize:       '0.85rem',
  textDecoration: 'none',
  letterSpacing:  '0.04em',
};

// Inject spinner keyframe once (avoids needing a CSS file)
if (typeof document !== 'undefined' && !document.getElementById('ss-spinner')) {
  const s = document.createElement('style');
  s.id = 'ss-spinner';
  s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}
