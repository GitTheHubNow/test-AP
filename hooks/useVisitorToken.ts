'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'memorial_visitor_token';

/**
 * useVisitorToken
 *
 * Returns a stable UUID for this browser session.
 * Generated once, persisted in localStorage forever.
 * Used to identify reactions without requiring auth.
 *
 * Returns null on first render (SSR-safe) then the token after mount.
 *
 * Phase 7
 */
export function useVisitorToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      let stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        stored = crypto.randomUUID();
        localStorage.setItem(STORAGE_KEY, stored);
      }
      setToken(stored);
    } catch {
      // localStorage blocked (private browsing edge cases) — generate ephemeral token
      setToken(crypto.randomUUID());
    }
  }, []);

  return token;
}
