'use client';

import { useEffect } from 'react';

/**
 * usePageView
 *
 * Fires a single POST to /api/public/memorial/[token]/view on mount.
 * Reads ?ref= from the URL to attribute the visit source.
 * Deduplication (30-min window) handled server-side.
 * Fails silently — analytics must never break the page.
 *
 * Phase 9
 */
export function usePageView(memorialToken: string, visitorToken: string | null) {
  useEffect(() => {
    if (!visitorToken) return; // wait until localStorage token is ready

    const params  = new URLSearchParams(window.location.search);
    const referrer = params.get('ref') ?? undefined;

    fetch(`/api/public/memorial/${memorialToken}/view`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ visitorToken, referrer }),
    }).catch(() => {
      // Silently ignore — analytics must not affect UX
    });
  }, [memorialToken, visitorToken]);
}
