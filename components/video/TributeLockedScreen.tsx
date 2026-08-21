'use client';

// components/video/TributeLockedScreen.tsx
//
// Shown in place of the Tribute Video editor while it's still locked
// (see lib/memorial/journeyGate.ts — normally opens 5 days before the
// service). Lets staff unlock it early for the common in-person case:
// a family member arrives with a USB stick of photos ready to go, no
// reason to make them wait for the countdown.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Props {
  memorialId:     string;
  daysLeft:       number | null;
  hasFuneralDate: boolean;
}

export function TributeLockedScreen({ memorialId, daysLeft, hasFuneralDate }: Props) {
  const router = useRouter();
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlockEarly() {
    setUnlocking(true);
    setError(null);
    try {
      const res = await fetch(`/api/memorial/${memorialId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tributeUnlockOverride: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Could not unlock');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock');
      setUnlocking(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#faf8f4',
        fontFamily: "'Lora', Georgia, serif",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: 'center',
          background: '#fffdf7',
          border: '1px solid #e8dcc8',
          borderRadius: 14,
          padding: '2.75rem 2.25rem',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#1a0e05',
            margin: '0 0 0.6rem',
          }}
        >
          Tribute Video isn&rsquo;t open yet
        </h1>
        <p style={{ fontSize: '0.88rem', color: '#7a6a52', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
          {hasFuneralDate
            ? daysLeft && daysLeft > 0
              ? `This normally opens automatically 5 days before the service — ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go.`
              : 'This opens automatically 5 days before the service.'
            : 'This opens automatically 5 days before the service. Add a service date in Settings to start the countdown.'}
        </p>
        <p style={{ fontSize: '0.8rem', color: '#9c7c50', lineHeight: 1.6, margin: '0 0 1.75rem' }}>
          If the family has photos ready right now — for example on a USB stick — you can open it early.
        </p>

        {error && (
          <p style={{ fontSize: '0.78rem', color: '#c0523a', margin: '0 0 1rem' }}>{error}</p>
        )}

        <button
          onClick={handleUnlockEarly}
          disabled={unlocking}
          style={{
            width: '100%',
            padding: '0.8rem',
            borderRadius: 8,
            border: '1px solid #cdba93',
            background: unlocking ? 'rgba(205,186,147,0.3)' : 'linear-gradient(135deg, #cdba93, #e8c87e)',
            color: '#1a0e05',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: unlocking ? 'default' : 'pointer',
          }}
        >
          {unlocking ? 'Unlocking…' : 'Unlock Tribute Video now'}
        </button>

        <div style={{ marginTop: '1.25rem' }}>
          <Link
            href={`/dashboard/memorial/${memorialId}/collection`}
            style={{ fontSize: '0.78rem', color: '#9c7c50', textDecoration: 'none' }}
          >
            ← Back to Collection
          </Link>
        </div>
      </div>
    </div>
  );
}
