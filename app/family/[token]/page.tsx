'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';

export default function FamilyAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/family-access/${token}/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      router.push(`/family/dashboard/${data.data.memorialId}`);
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--ivory)',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.25em',
          textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '1.5rem',
        }}>
          Absolute Posterity
        </p>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400,
          color: 'var(--ink)', marginBottom: '1rem', lineHeight: 1.3,
        }}>
          Manage your memorial
        </h1>

        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '1.15rem', lineHeight: 1.7,
          color: 'var(--ink-light)', marginBottom: '2.5rem',
        }}>
          Enter the email address the funeral home has on file for you.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: '100%',
              fontSize: '1.25rem',
              padding: '1rem 1.25rem',
              borderRadius: '8px',
              border: '2px solid var(--ivory-dark)',
              background: '#fff',
              color: 'var(--ink)',
              textAlign: 'center',
              marginBottom: '1.25rem',
              fontFamily: 'var(--font-body)',
            }}
          />

          {error && (
            <p style={{
              color: '#a33', fontSize: '1rem', marginBottom: '1.25rem',
              fontFamily: 'var(--font-body)', lineHeight: 1.5,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              fontSize: '1.25rem',
              padding: '1rem',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--gold)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>

        <p style={{
          marginTop: '2.5rem', fontSize: '0.95rem', color: 'var(--ink-muted)',
          fontFamily: 'var(--font-body)', lineHeight: 1.6,
        }}>
          Having trouble? Contact the funeral home who set up this memorial —
          they can help.
        </p>
      </div>
    </div>
  );
}
