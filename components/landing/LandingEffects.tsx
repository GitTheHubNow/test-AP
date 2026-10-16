'use client';

// Page-wide behaviour that needs no markup of its own:
//   1. Scroll reveal — elements marked `.rv` fade/slide in as they enter view.
//   2. Tile glow — a soft light follows the pointer across `.tile` cards.
//
// REVEAL IS PROGRESSIVE ENHANCEMENT, NOT A GATE. Content is fully visible in the
// server-rendered HTML. Only AFTER hydration do we hide elements that are still
// below the fold (so the visitor never sees them disappear), then reveal them as
// they scroll in. No JavaScript, or prefers-reduced-motion → nothing is ever hidden.

import { useEffect } from 'react';

export function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.lp');
    if (!root) return;

    // ── tile glow (one delegated listener instead of one per tile) ──────────
    const onMove = (e: PointerEvent) => {
      const tile = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tile');
      if (!tile) return;
      const r = tile.getBoundingClientRect();
      tile.style.setProperty('--x', `${e.clientX - r.left}px`);
      tile.style.setProperty('--y', `${e.clientY - r.top}px`);
    };
    root.addEventListener('pointermove', onMove);

    // ── scroll reveal ───────────────────────────────────────────────────────
    let io: IntersectionObserver | undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('rv-in');
              io?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.12 },
      );
      root.querySelectorAll<HTMLElement>('.rv').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen: leave it alone
        el.classList.add('rv-hide');
        io!.observe(el);
      });
    }

    return () => {
      root.removeEventListener('pointermove', onMove);
      io?.disconnect();
      root.querySelectorAll('.rv-hide').forEach((el) => el.classList.remove('rv-hide', 'rv-in'));
    };
  }, []);

  return null;
}
