// components/qr/experiences.tsx
//
// All QR lifecycle experience components.
// One component per QRState value.
// All rendered inside MemorialShell by app/v/[publicToken]/page.tsx.
//
// Design matches V1 exactly: dark navy, gold accent, Georgia serif.
// Mobile-first. No JavaScript required for basic rendering.

import type { MemorialPublicData, ResolvedTheme } from '@/types/v2';

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionDivider({ color }: { color: string }) {
  return (
    <div
      style={{
        height:     1,
        background: `${color}22`,
        margin:     '1.75rem 0',
      }}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin:        '0 0 0.3rem',
        fontSize:      '0.6rem',
        letterSpacing: '0.24em',
        textTransform: 'uppercase',
        color:         '#8290a3',
        fontFamily:    'Arial, sans-serif',
      }}
    >
      {children}
    </p>
  );
}

function FieldValue({
  children,
  large,
}: {
  children: React.ReactNode;
  large?:   boolean;
}) {
  return (
    <p
      style={{
        margin:     0,
        fontSize:   large ? '1.05rem' : '0.9rem',
        color:      '#f4f1ea',
        fontWeight: 300,
        lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

// ── Deceased heading (shared) ─────────────────────────────────────────────────

type DeceasedFields = Pick<
  MemorialPublicData,
  'firstName' | 'lastName' | 'preferredName' | 'birthDate' | 'deathDate'
>;

function DeceasedHeading({
  memorial,
  primaryColor,
}: {
  memorial:     DeceasedFields;
  primaryColor: string;
}) {
  const name =
    memorial.preferredName ??
    [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') ??
    'This Memorial';

  const birthYear = memorial.birthDate
    ? new Date(memorial.birthDate).getFullYear()
    : null;
  const deathYear = memorial.deathDate
    ? new Date(memorial.deathDate).getFullYear()
    : null;
  const years =
    birthYear && deathYear ? `${birthYear} – ${deathYear}` : null;

  return (
    <div style={{ marginBottom: '2rem' }}>
      {years && (
        <p
          style={{
            margin:        '0 0 0.5rem',
            fontSize:      '0.65rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color:         primaryColor,
            opacity:       0.8,
          }}
        >
          {years}
        </p>
      )}
      <h1
        style={{
          margin:        0,
          fontSize:      'clamp(1.6rem, 5vw, 2.2rem)',
          fontWeight:    300,
          color:         '#f4f1ea',
          lineHeight:    1.2,
          letterSpacing: '0.02em',
        }}
      >
        {name}
      </h1>
    </div>
  );
}

// ── Date formatters ───────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-AU', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── 1. PamphletView (PRE_SERVICE + SERVICE_ACTIVE) ────────────────────────────

export function PamphletView({
  memorial,
  theme,
}: {
  memorial: MemorialPublicData;
  theme:    ResolvedTheme;
}) {
  // Service date: prefer Phase 17 serviceStartAt, fall back to V1 serviceTime / funeralDate
  const serviceDate =
    memorial.serviceStartAt ??
    memorial.serviceTime ??
    memorial.funeralDate;

  const heading =
    memorial.pamphletTitle ??
    `Service for ${memorial.preferredName ?? memorial.firstName ?? 'the deceased'}`;

  return (
    <div>
      <p
        style={{
          margin:        '0 0 0.75rem',
          fontSize:      '0.62rem',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color:         theme.primaryColor,
        }}
      >
        In Memory of
      </p>

      <DeceasedHeading memorial={memorial} primaryColor={theme.primaryColor} />

      <SectionDivider color={theme.primaryColor} />

      <h2
        style={{
          margin:        '0 0 1.75rem',
          fontSize:      '1.1rem',
          fontWeight:    400,
          color:         '#d4cfc5',
          letterSpacing: '0.03em',
        }}
      >
        {heading}
      </h2>

      {/* Service date + time */}
      {serviceDate && (
        <div style={{ marginBottom: '1.25rem' }}>
          <FieldLabel>Date &amp; Time</FieldLabel>
          <FieldValue large>{fmtDate(new Date(serviceDate))}</FieldValue>
          <FieldValue>{fmtTime(new Date(serviceDate))}</FieldValue>
        </div>
      )}

      {/* Venue */}
      {(memorial.venueName || memorial.venueAddress) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <FieldLabel>Venue</FieldLabel>
          {memorial.venueName    && <FieldValue large>{memorial.venueName}</FieldValue>}
          {memorial.venueAddress && <FieldValue>{memorial.venueAddress}</FieldValue>}
          {memorial.pamphletVenueNote && (
            <p
              style={{
                margin:     '0.4rem 0 0',
                fontSize:   '0.78rem',
                color:      '#8290a3',
                fontStyle:  'italic',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              {memorial.pamphletVenueNote}
            </p>
          )}
        </div>
      )}

      {/* Service type */}
      {memorial.serviceType && (
        <div style={{ marginBottom: '1.25rem' }}>
          <FieldLabel>Service Type</FieldLabel>
          <FieldValue>{memorial.serviceType}</FieldValue>
        </div>
      )}

      {/* Family message */}
      {memorial.pamphletMessage && (
        <>
          <SectionDivider color={theme.primaryColor} />
          <div
            style={{
              background:   `${theme.primaryColor}08`,
              border:       `1px solid ${theme.primaryColor}18`,
              borderRadius: 10,
              padding:      '1.25rem 1.5rem',
            }}
          >
            <FieldLabel>Message</FieldLabel>
            <p
              style={{
                margin:     '0.5rem 0 0',
                fontSize:   '0.92rem',
                color:      '#d4cfc5',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}
            >
              {memorial.pamphletMessage}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── 2. WaitingView (UNLOCK_PENDING) ──────────────────────────────────────────

export function WaitingView({
  memorial,
  theme,
}: {
  memorial: DeceasedFields & { unlockAt: Date | null };
  theme:    ResolvedTheme;
}) {
  const unlockAt = memorial.unlockAt ? new Date(memorial.unlockAt) : null;

  return (
    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
      <div
        style={{
          fontSize:     '2rem',
          marginBottom: '2rem',
          opacity:      0.25,
          color:        theme.primaryColor,
        }}
      >
        ✦
      </div>

      <DeceasedHeading memorial={memorial} primaryColor={theme.primaryColor} />

      <p
        style={{
          fontSize:   '0.9rem',
          color:      '#8290a3',
          lineHeight: 1.7,
          margin:     '0 auto 1.5rem',
          maxWidth:   400,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        The memorial for{' '}
        <span style={{ color: '#d4cfc5' }}>
          {memorial.preferredName ?? memorial.firstName}
        </span>{' '}
        will be available soon.
      </p>

      {unlockAt && (
        <div
          style={{
            display:       'inline-flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           '0.3rem',
            background:    `${theme.primaryColor}0a`,
            border:        `1px solid ${theme.primaryColor}20`,
            borderRadius:  10,
            padding:       '1rem 2rem',
          }}
        >
          <span
            style={{
              fontSize:      '0.6rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color:         '#8290a3',
              fontFamily:    'Arial, sans-serif',
            }}
          >
            Memorial opens
          </span>
          <span
            style={{ fontSize: '1rem', color: '#f4f1ea', fontWeight: 300 }}
          >
            {fmtDate(unlockAt)}
          </span>
          <span style={{ fontSize: '0.85rem', color: theme.primaryColor }}>
            {fmtTime(unlockAt)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── 3. MemorialOpenView (fallback only) ───────────────────────────────────────
//
// NOTE: for the normal MEMORIAL_OPEN case, the full memorial content
// (gallery, guest book, memories, video) now renders directly in
// app/v/[slug]/page.tsx before this component is ever reached — see the
// `if (effectiveState === 'MEMORIAL_OPEN')` early-return block there.
//
// This component now only fires as the `default` case in that page's
// renderExperience() switch — i.e. an unexpected/future qrState value.
// It used to link out to the retired /m/[qrTokenHash] page (Phase 1
// placeholder); since that's gone, this just offers a retry link back to
// the current page, which will correctly resolve to the real content
// above on the next request if the state was transient.

export function MemorialOpenView({
  memorial,
  theme,
}: {
  memorial: MemorialPublicData;
  theme:    ResolvedTheme;
}) {
  return (
    <div>
      <p
        style={{
          margin:        '0 0 0.75rem',
          fontSize:      '0.62rem',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color:         theme.primaryColor,
        }}
      >
        In Memory of
      </p>

      <DeceasedHeading memorial={memorial} primaryColor={theme.primaryColor} />

      <p
        style={{
          fontSize:   '0.88rem',
          color:      '#8290a3',
          lineHeight: 1.7,
          fontFamily: 'Arial, sans-serif',
          margin:     '0 0 1.5rem',
        }}
      >
        View the memorial for{' '}
        {memorial.preferredName ?? memorial.firstName ?? 'the deceased'}.
      </p>

      <a
        href="."
        style={{
          display:        'inline-block',
          padding:        '0.65rem 1.5rem',
          background:     `${theme.primaryColor}14`,
          border:         `1px solid ${theme.primaryColor}40`,
          color:          theme.primaryColor,
          textDecoration: 'none',
          borderRadius:   6,
          fontSize:       '0.85rem',
          letterSpacing:  '0.04em',
          fontFamily:     'Georgia, serif',
        }}
      >
        View Memorial →
      </a>
    </div>
  );
}

// ── 4. PrivateView (PRIVATE) ──────────────────────────────────────────────────

export function PrivateView({ theme }: { theme: ResolvedTheme }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 0' }}>
      <div
        style={{
          fontSize:     '1.8rem',
          marginBottom: '1.5rem',
          opacity:      0.18,
          color:        theme.primaryColor,
        }}
      >
        ✦
      </div>
      <h2
        style={{
          fontSize:   '1.1rem',
          fontWeight: 300,
          color:      '#f4f1ea',
          margin:     '0 0 0.75rem',
        }}
      >
        This memorial is private
      </h2>
      <p
        style={{
          fontSize:   '0.85rem',
          color:      '#6b7890',
          margin:     0,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        This page has been made private by the family.
      </p>
    </div>
  );
}

// ── 5. ArchivedView (ARCHIVED) ────────────────────────────────────────────────

export function ArchivedView({
  memorial,
  theme,
}: {
  memorial: DeceasedFields;
  theme:    ResolvedTheme;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 0' }}>
      <div
        style={{
          fontSize:     '1.8rem',
          marginBottom: '1.5rem',
          opacity:      0.15,
          color:        '#8290a3',
        }}
      >
        ✦
      </div>

      <DeceasedHeading memorial={memorial} primaryColor={theme.primaryColor} />

      <p
        style={{
          fontSize:   '0.85rem',
          color:      '#6b7890',
          lineHeight: 1.7,
          fontFamily: 'Arial, sans-serif',
          margin:     '0 auto',
          maxWidth:   360,
        }}
      >
        This memorial has been archived and is no longer publicly available.
      </p>
    </div>
  );
}
