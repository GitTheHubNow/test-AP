'use client';

import { useState } from 'react';
import { MemorialPageClient } from './MemorialPageClient';

interface Flags {
  isAboriginal:           boolean;
  isTorresStraitIslander: boolean;
  isSouthSeaIslander:     boolean;
  isMaori:                boolean;
}

interface Props {
  displayName: string;
  flags:       Flags;
  memorial:    any;
}

const GROUP_LABELS: { key: keyof Flags; label: string }[] = [
  { key: 'isAboriginal',           label: 'Aboriginal Australian' },
  { key: 'isTorresStraitIslander', label: 'Torres Strait Islander' },
  { key: 'isSouthSeaIslander',     label: 'South Sea Islander' },
  { key: 'isMaori',                label: 'Māori' },
];

export function CulturalWarning({ displayName, flags, memorial }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (acknowledged) return <MemorialPageClient memorial={memorial} />;

  const activeGroups = GROUP_LABELS.filter(g => flags[g.key]).map(g => g.label);
  const groupText    = activeGroups.length === 1
    ? activeGroups[0]
    : activeGroups.slice(0, -1).join(', ') + ' and ' + activeGroups.at(-1);

  return (
    <div style={{
      minHeight: '100vh', background: '#1a1208',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', fontFamily: 'Georgia, serif',
    }}>
      {/* Subtle texture overlay */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(201,169,110,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(201,169,110,0.05) 0%, transparent 50%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 520, width: '100%', position: 'relative', zIndex: 1, textAlign: 'center' }}>

        {/* Ochre rule */}
        <div style={{ width: 40, height: 3, background: '#c9a96e', margin: '0 auto 2rem', borderRadius: 2 }} />

        <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#c9a96e', marginBottom: '1.5rem' }}>
          Cultural Advisory
        </p>

        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 400, color: '#f5f0e8', lineHeight: 1.2, marginBottom: '1.5rem' }}>
          In Memory of<br />
          <span style={{ fontStyle: 'italic' }}>{displayName}</span>
        </h1>

        <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,169,110,0.4), transparent)', margin: '0 0 1.75rem' }} />

        <p style={{ fontSize: '1rem', color: '#c9a96e', lineHeight: 1.8, marginBottom: '1.25rem' }}>
          This memorial contains images and content of a deceased{' '}
          <strong style={{ color: '#e8d5a3' }}>{groupText}</strong> person.
        </p>

        <p style={{ fontSize: '0.875rem', color: '#8a8070', lineHeight: 1.8, marginBottom: '2.5rem' }}>
          In accordance with cultural protocols observed across Australia and New Zealand,
          we ask that you be aware some community members may find it distressing to view
          images or read the name of someone who has passed.
        </p>

        <button
          onClick={() => setAcknowledged(true)}
          style={{
            padding: '0.875rem 2.5rem',
            background: 'transparent',
            border: '1px solid #c9a96e',
            color: '#c9a96e',
            fontFamily: 'Georgia, serif',
            fontSize: '0.9rem',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            borderRadius: 2,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.background = '#c9a96e';
            (e.target as HTMLButtonElement).style.color = '#1a1208';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.background = 'transparent';
            (e.target as HTMLButtonElement).style.color = '#c9a96e';
          }}
        >
          I understand — continue
        </button>

        <p style={{ marginTop: '1.5rem', fontSize: '0.72rem', color: '#5a5040', lineHeight: 1.6 }}>
          Aboriginal and Torres Strait Islander peoples are advised that this page
          may contain names and images of deceased persons.
        </p>

      </div>
    </div>
  );
}
