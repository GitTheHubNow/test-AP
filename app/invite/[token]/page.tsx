'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

interface InviteInfo {
  orgName: string;
  email:   string;
  role:    string;
}

/**
 * app/invite/[token]/page.tsx
 *
 * Public invite accept page. Flow:
 *   1. Fetch invite info (org name, invited email) — works whether or
 *      not the visitor is signed in yet.
 *   2. If not signed in: show Clerk's <SignUp> component, pre-filled/
 *      locked to the invited email where possible, with
 *      forceRedirectUrl pointing right back to this same page — so the
 *      moment sign-up completes, the visitor lands back here already
 *      authenticated.
 *   3. If signed in: immediately call the accept API. This is the step
 *      that matters for the auto-personal-org race condition — see the
 *      long comment in app/api/org/invite/[token]/accept/route.ts. This
 *      page calls accept as the FIRST authenticated action for a new
 *      user, before redirecting to /dashboard, so no other API call
 *      gets a chance to auto-create a personal org first.
 *   4. On success, redirect to /dashboard.
 */
export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [hasAttemptedAccept, setHasAttemptedAccept] = useState(false);

  // Step 1 — load invite info, works pre-auth.
  useEffect(() => {
    fetch(`/api/org/invite/${params.token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          setLoadError(json.error ?? 'This invite link is invalid.');
          return;
        }
        setInvite(json.data);
      })
      .catch(() => setLoadError('Failed to load invite details.'));
  }, [params.token]);

  // Step 3 — once signed in, accept immediately (once, not on every
  // render — hasAttemptedAccept guards against re-firing on re-renders
  // caused by the accept call itself changing auth state).
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !invite || hasAttemptedAccept) return;

    setHasAttemptedAccept(true);
    setAccepting(true);

    fetch(`/api/org/invite/${params.token}/accept`, { method: 'POST' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          setAcceptError(json.error ?? 'Failed to accept invite.');
          setAccepting(false);
          return;
        }
        // Step 4 — success, go to dashboard. Full page navigation
        // (not router.push) so any server-side layout that reads org
        // membership re-fetches fresh rather than using stale state.
        window.location.href = '/dashboard';
      })
      .catch(() => {
        setAcceptError('Failed to accept invite. Please try again.');
        setAccepting(false);
      });
  }, [isLoaded, isSignedIn, invite, hasAttemptedAccept, params.token]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invite not available</h1>
          <p className="text-gray-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!invite || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading invite…</p>
      </div>
    );
  }

  if (acceptError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Couldn't accept invite</h1>
          <p className="text-gray-600">{acceptError}</p>
        </div>
      </div>
    );
  }

  if (isSignedIn) {
    // Signed in — the useEffect above is either mid-flight (accepting)
    // or about to redirect. Show a lightweight loading state rather
    // than a blank page during that gap.
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">
          {accepting ? 'Joining organisation…' : 'One moment…'}
        </p>
      </div>
    );
  }

  // Not signed in — show sign-up, forced back to this exact page once
  // complete, so step 3 above runs as the very next thing that happens.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Join {invite.orgName}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You've been invited as a {invite.role.toLowerCase()}. Create an account with{' '}
            <strong>{invite.email}</strong> to accept.
          </p>
        </div>
        <SignUp
          initialValues={{ emailAddress: invite.email }}
          forceRedirectUrl={`/invite/${params.token}`}
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card:    'shadow-lg',
            },
          }}
        />
      </div>
    </div>
  );
}
