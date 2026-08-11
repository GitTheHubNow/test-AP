'use client';

/**
 * app/onboarding/page.tsx
 *
 * Part D — Step 1 of the guided onboarding flow: "Name your organisation."
 *
 * This is the FIRST screen a brand-new, non-invited signup should ever see —
 * sign-up now redirects here instead of straight to /dashboard. Its job is
 * to make org creation a deliberate, visible step instead of the silent
 * auto-create that previously happened the moment /api/dashboard/memorials
 * (or any other org-scoped route) first ran for a new user.
 *
 * Invited users never reach this page — they land on /invite/[token]
 * directly and accept into the org they were invited to, which is a
 * completely separate, already-working path (see
 * app/api/org/invite/[token]/accept/route.ts). This page and that route
 * are mutually exclusive entry points.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Please enter a name for your organisation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/create-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }

      router.push('/onboarding/payment');
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a16', fontFamily: 'Georgia, serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', justifyContent: 'center' }}>
          <StepDot active />
          <StepLine />
          <StepDot />
        </div>

        <div style={{
          background: '#0d0c1e', border: '1px solid #1e1e38', borderRadius: 14,
          padding: '2.5rem 2.25rem',
        }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#c9a96e' }}>
            Step 1 of 2
          </p>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 300, color: '#f5f0e8' }}>
            Name your organisation
          </h1>
          <p style={{ margin: '0 0 1.75rem', fontSize: '0.85rem', color: '#8a8aaa', lineHeight: 1.5 }}>
            This is how your funeral home or team will appear across Memoriam.
            You can invite colleagues once you're set up.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: '0.72rem', color: '#8a8aaa', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
              Organisation name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Smith Funeral Services"
              autoFocus
              maxLength={120}
              disabled={isSubmitting}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '0.75rem 0.9rem',
                background: '#0a0a16', border: '1px solid #2a2a4a', borderRadius: 8,
                color: '#f5f0e8', fontFamily: 'Georgia, serif', fontSize: '0.95rem',
                outline: 'none',
              }}
            />

            {error && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#e0876a' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%', marginTop: '1.5rem',
                padding: '0.8rem', borderRadius: 8,
                background: isSubmitting ? 'rgba(201,169,110,0.2)' : 'rgba(201,169,110,0.15)',
                border: '1px solid rgba(201,169,110,0.4)',
                color: '#c9a96e', fontFamily: 'Georgia, serif', fontSize: '0.9rem',
                letterSpacing: '0.03em', cursor: isSubmitting ? 'default' : 'pointer',
              }}
            >
              {isSubmitting ? 'Creating…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StepDot({ active = false }: { active?: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: active ? '#c9a96e' : '#2a2a4a',
    }} />
  );
}

function StepLine() {
  return <div style={{ width: 28, height: 1, background: '#2a2a4a' }} />;
}
