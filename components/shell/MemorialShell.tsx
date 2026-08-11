// components/shell/MemorialShell.tsx
//
// Public page wrapper for all QR lifecycle experiences.
// Used by app/v/[publicToken]/page.tsx.
//
// When isWhiteLabelEnabled = false (all current funeral homes):
//   renders Memoriam defaults — dark navy background, gold accent.
//   Matches V1 memorial page aesthetic exactly.
//
// When isWhiteLabelEnabled = true (future):
//   renders org branding — logo, colours, support email.
//
// No auth required. This is a public component.

import type { ResolvedTheme } from '@/types/v2';

interface Props {
  theme:    ResolvedTheme;
  children: React.ReactNode;
}

export function MemorialShell({ theme, children }: Props) {
  return (
    <div
      style={{
        minHeight:  '100vh',
        background: theme.secondaryColor,
        color:      '#f5f0e8',
        fontFamily: 'Georgia, serif',
      }}
    >
      <ShellHeader theme={theme} />

      <main
        style={{
          maxWidth: 780,
          margin:   '0 auto',
          padding:  '2.5rem 1.5rem 5rem',
        }}
      >
        {children}
      </main>

      <ShellFooter theme={theme} />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function ShellHeader({ theme }: { theme: ResolvedTheme }) {
  return (
    <header
      style={{
        padding:      '1.5rem 2rem',
        borderBottom: `1px solid ${withAlpha(theme.primaryColor, 0.15)}`,
        display:      'flex',
        alignItems:   'center',
      }}
    >
      {theme.logoUrl ? (
        <img
          src={theme.logoUrl}
          alt={theme.brandName}
          style={{
            maxHeight:  40,
            maxWidth:   180,
            objectFit:  'contain',
            display:    'block',
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize:      '0.58rem',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color:         theme.primaryColor,
              opacity:       0.7,
            }}
          >
            {theme.isWhiteLabel ? 'Memorial Service' : 'Memoriam'}
          </span>
          <span
            style={{
              fontSize:      '1.05rem',
              fontWeight:    300,
              color:         '#f5f0e8',
              letterSpacing: '0.04em',
            }}
          >
            {theme.brandName}
          </span>
        </div>
      )}
    </header>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function ShellFooter({ theme }: { theme: ResolvedTheme }) {
  const showPoweredBy = theme.poweredByEnabled && !theme.isWhiteLabel;
  if (!theme.supportEmail && !showPoweredBy) return null;

  return (
    <footer
      style={{
        borderTop:     `1px solid ${withAlpha(theme.primaryColor, 0.08)}`,
        padding:       '2rem 1.5rem',
        maxWidth:      780,
        margin:        '0 auto',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           '0.5rem',
      }}
    >
      {theme.supportEmail && (
        <p
          style={{
            margin:        0,
            fontSize:      '0.72rem',
            color:         '#3a3a5a',
            letterSpacing: '0.03em',
            fontFamily:    'Arial, sans-serif',
          }}
        >
          Questions?{' '}
          <a
            href={`mailto:${theme.supportEmail}`}
            style={{ color: theme.primaryColor, textDecoration: 'none' }}
          >
            {theme.supportEmail}
          </a>
        </p>
      )}
      {showPoweredBy && (
        <p
          style={{
            margin:        0,
            fontSize:      '0.6rem',
            color:         '#2a2a40',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontFamily:    'Arial, sans-serif',
          }}
        >
          Powered by Memoriam
        </p>
      )}
    </footer>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function withAlpha(hex: string, alpha: number): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return `rgba(201,169,110,${alpha})`;
  }
}
