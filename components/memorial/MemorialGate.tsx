'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MemorialGateProps {
  slug:          string;
  memorialId:    string;
  memorialTitle: string;
}

/**
 * MemorialGate — v2
 *
 * Earlier iteration navigated via router.push(`/${slug}?key=...`) — a
 * router-level soft navigation — and relied on the resulting server-
 * component re-render to show either success or the gate again. In
 * practice this left the button stuck on "Checking..." indefinitely on a
 * wrong code — Next's client router doesn't reliably reset local
 * component state across a soft navigation to the same dynamic route with
 * only the query string changed, and a failed check has no explicit
 * "show an error" path in that approach.
 *
 * Fixed by validating directly against /api/memorial-access/unlock via
 * fetch FIRST. That route already re-validates the key server-side
 * (see app/api/memorial-access/unlock/route.ts) and sets the cookie on
 * success — so on success we just need to reload; on failure we get an
 * explicit, immediate error state with no ambiguity. On success this
 * redirects to /v/{slug} — the canonical public route (see
 * app/v/[slug]/page.tsx); the earlier bare /{slug} route it used to
 * describe has been merged into /v/[slug] and no longer exists.
 */
export function MemorialGate({ slug, memorialId, memorialTitle }: MemorialGateProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let trimmed = code.trim();

    // If someone pastes a full URL (e.g. copied the whole QR link instead
    // of just the code), extract the key param rather than send the raw
    // URL as the "code" — this happened during testing and is a
    // reasonable thing for a real visitor to do too (copying a link from
    // a text message rather than typing a bare code).
    if (trimmed.includes('key=')) {
      try {
        const url = new URL(trimmed, window.location.origin);
        const extracted = url.searchParams.get('key');
        if (extracted) trimmed = extracted;
      } catch {
        // Not a valid URL — fall through and use the raw input as-is,
        // it'll just fail validation server-side like any other wrong code.
      }
    }
    if (!trimmed) {
      setError('Please enter the access code.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/memorial-access/unlock', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ memorialId, key: trimmed }),
      });

      if (res.ok) {
        // Cookie is now set server-side. Full reload (not router.push)
        // so the server component re-runs fresh and picks up the cookie
        // via a completely new request — no reliance on soft-navigation
        // state syncing correctly.
        window.location.href = `/v/${slug}`;
        return; // don't reset submitting — page is navigating away
      }

      const json = await res.json().catch(() => ({}));
      setError(json.error === 'Invalid access code'
        ? 'That code doesn\u2019t match. Please check and try again.'
        : 'Something went wrong. Please try again.');
      setSubmitting(false);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#faf9f7' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-xl"
            style={{ backgroundColor: '#cdba9322', border: '1.5px solid #cdba9355' }}
          >
            🕊️
          </div>
          <h1
            className="text-lg font-semibold text-gray-900 mb-1"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {memorialTitle}
          </h1>
          <p className="text-sm text-gray-500">
            This memorial is private. Enter the access code from your invitation
            or QR code to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            autoFocus
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm
                       focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ ['--tw-ring-color' as string]: '#cdba93' }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl font-medium text-white transition-all
                       duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundColor: '#cdba93' }}
          >
            {submitting ? 'Checking...' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Don't have the code? Contact the family or funeral home who shared
          this memorial with you.
        </p>
      </div>
    </div>
  );
}
