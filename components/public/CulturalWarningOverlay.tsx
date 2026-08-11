'use client';

import { useState, useEffect } from 'react';

interface CulturalWarningOverlayProps {
  memorialId:             string;
  isAboriginal:           boolean;
  isTorresStraitIslander: boolean;
  isSouthSeaIslander:     boolean;
  isMaori:                boolean;
}

// Warning text per group — AIATSIS-style language
// Owners can request customisation via support; this is the standard form.
const WARNING_TEXT: Record<string, { heading: string; body: string }> = {
  isAboriginal: {
    heading: 'Aboriginal Cultural Warning',
    body:    'This page contains images and voices of Aboriginal people who have passed away. Aboriginal and Torres Strait Islander peoples are warned that the following material may contain images, voices or names of deceased persons.',
  },
  isTorresStraitIslander: {
    heading: 'Torres Strait Islander Cultural Warning',
    body:    'This page contains images and voices of Torres Strait Islander people who have passed away. Aboriginal and Torres Strait Islander peoples are warned that the following material may contain images, voices or names of deceased persons.',
  },
  isSouthSeaIslander: {
    heading: 'South Sea Islander Cultural Warning',
    body:    'This page contains images and voices of South Sea Islander people who have passed away. South Sea Islander peoples are advised that the following material may contain images, voices or names of deceased persons.',
  },
  isMaori: {
    heading: 'Māori Cultural Warning — He Kaupapahere Ahurea',
    body:    'This page contains images and voices of Māori people who have passed away. Māori whānau are advised that the following material may contain images, voices or names of tūpāpaku (deceased persons).',
  },
};

// Flags in priority order — first active one determines the primary warning shown.
// If multiple are set, all are listed.
const FLAG_KEYS = [
  'isAboriginal',
  'isTorresStraitIslander',
  'isSouthSeaIslander',
  'isMaori',
] as const;

type FlagKey = typeof FLAG_KEYS[number];

/**
 * CulturalWarningOverlay
 *
 * Full-screen overlay shown before any memorial content when one or more
 * cultural warning flags are set. Visitor must click "I Understand — Continue"
 * to dismiss. Dismissed state stored in sessionStorage so it doesn't repeat
 * within the same browser session (refreshing the page won't re-show it).
 *
 * Phase 8 — Cultural sensitivity feature
 */
export function CulturalWarningOverlay({
  memorialId,
  isAboriginal,
  isTorresStraitIslander,
  isSouthSeaIslander,
  isMaori,
}: CulturalWarningOverlayProps) {
  const storageKey = `cultural_warning_dismissed_${memorialId}`;

  const flags: Record<FlagKey, boolean> = {
    isAboriginal,
    isTorresStraitIslander,
    isSouthSeaIslander,
    isMaori,
  };

  const activeFlags = FLAG_KEYS.filter(k => flags[k]);

  // No flags set — render nothing
  if (activeFlags.length === 0) return null;

  return <OverlayInner storageKey={storageKey} activeFlags={activeFlags} />;
}

// ── Inner component — handles state (must be client) ──────────────────────

function OverlayInner({
  storageKey,
  activeFlags,
}: {
  storageKey:  string;
  activeFlags: FlagKey[];
}) {
  const [dismissed, setDismissed] = useState(true); // start true to avoid flash
  const [loaded,    setLoaded]    = useState(false);

  useEffect(() => {
    try {
      const alreadyDismissed = sessionStorage.getItem(storageKey) === '1';
      setDismissed(alreadyDismissed);
    } catch {
      setDismissed(false);
    }
    setLoaded(true);
  }, [storageKey]);

  function handleDismiss() {
    try {
      sessionStorage.setItem(storageKey, '1');
    } catch {
      // sessionStorage blocked — dismiss anyway
    }
    setDismissed(true);
  }

  // Not loaded yet (SSR) or already dismissed
  if (!loaded || dismissed) return null;

  // Build warning content
  // If multiple flags: show a combined header + list all warnings
  const primaryFlag = activeFlags[0];
  const primaryText = WARNING_TEXT[primaryFlag];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cultural-warning-heading"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#1a1410' }}
      >
        {/* Top ochre bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background: 'linear-gradient(90deg, #c84b0c 0%, #e8a020 50%, #c84b0c 100%)',
          }}
        />

        <div className="px-8 py-8">
          {/* Icon */}
          <div className="mb-5 flex justify-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ backgroundColor: '#c84b0c22', border: '1.5px solid #c84b0c66' }}
            >
              🕊️
            </div>
          </div>

          {/* Heading */}
          <h2
            id="cultural-warning-heading"
            className="text-center text-xl font-bold text-white mb-1"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {activeFlags.length > 1 ? 'Cultural Warning' : primaryText.heading}
          </h2>

          <p
            className="text-center text-xs uppercase tracking-widest mb-6"
            style={{ color: '#c84b0c' }}
          >
            Please read before continuing
          </p>

          {/* Warning body — single or multiple */}
          <div className="space-y-4">
            {activeFlags.length === 1 ? (
              <p
                className="text-gray-300 leading-relaxed text-sm text-center"
                style={{ fontFamily: 'Georgia, serif', lineHeight: '1.8' }}
              >
                {primaryText.body}
              </p>
            ) : (
              activeFlags.map(flag => (
                <div
                  key={flag}
                  className="rounded-lg px-4 py-3"
                  style={{ backgroundColor: '#ffffff08', border: '1px solid #ffffff10' }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-1"
                    style={{ color: '#c84b0c' }}
                  >
                    {WARNING_TEXT[flag].heading}
                  </p>
                  <p
                    className="text-gray-300 text-sm leading-relaxed"
                    style={{ fontFamily: 'Georgia, serif', lineHeight: '1.75' }}
                  >
                    {WARNING_TEXT[flag].body}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Divider */}
          <div className="my-6 h-px" style={{ backgroundColor: '#ffffff15' }} />

          {/* Additional note */}
          <p className="text-center text-xs text-gray-500 mb-6 leading-relaxed">
            This warning is shown out of respect for First Nations and Islander
            communities, in accordance with Australian cultural protocols for
            content featuring deceased persons.
          </p>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #c84b0c 0%, #e8a020 100%)',
              fontFamily: 'Georgia, serif',
            }}
          >
            I Understand — Continue
          </button>

          <p className="text-center text-xs text-gray-600 mt-3">
            This warning will not appear again during this session.
          </p>
        </div>
      </div>
    </div>
  );
}
