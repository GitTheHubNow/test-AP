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
import Link from 'next/link';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [caseTypes, setCaseTypes] = useState<Set<'HUMAN' | 'PET'>>(new Set(['HUMAN']));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  function toggleCaseType(type: 'HUMAN' | 'PET') {
    setCaseTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Never allow zero selected — fall back to the type being
        // removed staying selected rather than leaving an org with
        // neither case-management feature enabled.
        if (next.size === 1) return next;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Please enter a name for your organisation.');
      return;
    }

    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/create-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, caseTypes: Array.from(caseTypes), agreedToTerms }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }

      router.push('/dashboard?onboarded=1');
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#4f5d75', fontFamily: 'Georgia, serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        <div style={{
          background: '#3f4c61', border: '1px solid #5c6a80', borderRadius: 14,
          padding: '2.5rem 2.25rem',
        }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.6rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#cdba93' }}>
            Welcome
          </p>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 300, color: '#f4f1ea' }}>
            Name your organisation
          </h1>
          <p style={{ margin: '0 0 1.75rem', fontSize: '0.85rem', color: '#8a8aaa', lineHeight: 1.5 }}>
            This is how your funeral home or team will appear across Absolute Posterity.
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
                background: '#4f5d75', border: '1px solid #5c6a80', borderRadius: 8,
                color: '#f4f1ea', fontFamily: 'Georgia, serif', fontSize: '0.95rem',
                outline: 'none',
              }}
            />

            {error && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: '#e0876a' }}>
                {error}
              </p>
            )}

            <label style={{ display: 'block', fontSize: '0.72rem', color: '#8a8aaa', margin: '1.5rem 0 0.5rem', letterSpacing: '0.03em' }}>
              What do you care for?
            </label>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {([
                { type: 'HUMAN' as const, label: 'Human funerals' },
                { type: 'PET'   as const, label: 'Pet aftercare' },
              ]).map(({ type, label }) => {
                const selected = caseTypes.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleCaseType(type)}
                    disabled={isSubmitting}
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.5rem',
                      borderRadius: 8,
                      fontFamily: 'Georgia, serif',
                      fontSize: '0.82rem',
                      cursor: isSubmitting ? 'default' : 'pointer',
                      background: selected ? 'rgba(205,186,147,0.15)' : 'transparent',
                      border: selected ? '1.5px solid #cdba93' : '1.5px solid #5c6a80',
                      color: selected ? '#cdba93' : '#8a8aaa',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#7c8aa0', lineHeight: 1.5 }}>
              You can select both. This sets up the right case-management workflow for your organisation.
            </p>

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              marginTop: '1.5rem', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={{ marginTop: '0.2rem', width: '16px', height: '16px', flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.78rem', color: '#7c8aa0', lineHeight: 1.5 }}>
                I agree to the{' '}
                <Link href="/terms" target="_blank" style={{ color: '#cdba93', textDecoration: 'underline' }}>
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link href="/privacy" target="_blank" style={{ color: '#cdba93', textDecoration: 'underline' }}>
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !agreedToTerms}
              style={{
                width: '100%', marginTop: '1rem',
                padding: '0.8rem', borderRadius: 8,
                background: (isSubmitting || !agreedToTerms) ? 'rgba(201,169,110,0.2)' : 'rgba(201,169,110,0.15)',
                border: '1px solid rgba(201,169,110,0.4)',
                color: '#cdba93', fontFamily: 'Georgia, serif', fontSize: '0.9rem',
                letterSpacing: '0.03em', cursor: (isSubmitting || !agreedToTerms) ? 'default' : 'pointer',
                opacity: !agreedToTerms ? 0.6 : 1,
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

