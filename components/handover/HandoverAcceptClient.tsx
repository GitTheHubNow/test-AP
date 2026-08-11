'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SignInButton, SignedIn, SignedOut, useUser } from '@clerk/nextjs';

interface Props {
  token:             string;
  memorial:          { id: string; title: string };
  familyContactName: string | null;
}

export function HandoverAcceptClient({ token, memorial, familyContactName }: Props) {
  const router               = useRouter();
  const { user }             = useUser();
  const [accepting, setAccepting] = useState(false);
  const [accepted,  setAccepted]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    try {
      const res  = await fetch(`/api/handover/accept/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to accept handover');
      setAccepted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setAccepting(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 12,
    border: '1px solid #ede8e0', padding: '2rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  };

  if (accepted) {
    return (
      <div style={cardStyle}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>✅</p>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#1a1714', textAlign: 'center', marginBottom: '0.75rem' }}>
          Ownership Transferred
        </h2>
        <p style={{ fontSize: '0.9rem', color: '#8a8a9a', fontFamily: 'Georgia, serif', lineHeight: 1.7, textAlign: 'center', marginBottom: '1.5rem' }}>
          You now have full ownership of <strong style={{ color: '#1a1714' }}>{memorial.title}</strong>.
          You can manage it from your dashboard.
        </p>
        <button
          onClick={() => router.push('/dashboard/memorials')}
          style={{
            width: '100%', padding: '0.85rem', borderRadius: 8,
            background: '#1a1a2e', color: '#f5f0e8', border: 'none',
            fontSize: '0.9rem', fontWeight: 600, fontFamily: 'Georgia, serif',
            cursor: 'pointer',
          }}
        >
          Go to My Dashboard →
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 400, color: '#1a1714', marginBottom: '0.5rem' }}>
        Accept Memorial Ownership
      </h1>
      <p style={{ fontSize: '0.9rem', color: '#8a8a9a', fontFamily: 'Georgia, serif', lineHeight: 1.7, marginBottom: '2rem' }}>
        {familyContactName ? `Hello, ${familyContactName}. A` : 'A'} funeral home has transferred ownership of{' '}
        <strong style={{ color: '#1a1714' }}>{memorial.title}</strong> to you.
        Once you accept, you will have full control of this memorial.
      </p>

      <div style={cardStyle}>

        <SignedOut>
          <p style={{ fontSize: '0.85rem', color: '#374151', fontFamily: 'Georgia, serif', lineHeight: 1.7, marginBottom: '1.25rem' }}>
            You need to sign in or create a free account to accept ownership.
            Your account will be linked to this memorial permanently.
          </p>
          <SignInButton mode="modal" forceRedirectUrl={`/handover/accept/${token}`}>
            <button style={{
              width: '100%', padding: '0.85rem', borderRadius: 8,
              background: '#1a1a2e', color: '#f5f0e8', border: 'none',
              fontSize: '0.9rem', fontWeight: 600, fontFamily: 'Georgia, serif',
              cursor: 'pointer',
            }}>
              Sign In or Create Account
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <p style={{ fontSize: '0.82rem', color: '#6B7280', fontFamily: 'Georgia, serif', marginBottom: '1rem' }}>
            Signed in as <strong style={{ color: '#1a1714' }}>{user?.primaryEmailAddress?.emailAddress}</strong>
          </p>

          <div style={{ background: '#FEF3C7', borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#92400E', fontFamily: 'Georgia, serif', lineHeight: 1.6 }}>
            <strong>Before you accept:</strong> The funeral home will lose all access to this memorial.
            You will be the sole owner. This cannot be undone.
          </div>

          {error && (
            <p style={{ fontSize: '0.82rem', color: '#991B1B', background: '#FEE2E2', padding: '0.65rem 0.9rem', borderRadius: 8, marginBottom: '1rem', fontFamily: 'Georgia, serif' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              width: '100%', padding: '0.85rem', borderRadius: 8,
              background: accepting ? '#c4bdb5' : '#1a1a2e', color: '#f5f0e8', border: 'none',
              fontSize: '0.9rem', fontWeight: 600, fontFamily: 'Georgia, serif',
              cursor: accepting ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
            }}
          >
            {accepting ? 'Transferring ownership…' : 'Accept Ownership →'}
          </button>
        </SignedIn>
      </div>
    </div>
  );
}
