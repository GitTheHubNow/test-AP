'use client';

// Rising embers behind the hero. Decorative only (aria-hidden); draws nothing
// when the visitor prefers reduced motion; cleans up its animation frame and
// listeners on unmount; sizes itself to the hero and re-sizes with it.

import { useEffect, useRef } from 'react';

interface Mote { x: number; y: number; r: number; v: number; p: number }

export function Motes() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let W = 0, H = 0, raf = 0;
    const size = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);

    const motes: Mote[] = Array.from({ length: 48 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.5, v: Math.random() * 0.25 + 0.08, p: Math.random() * 6,
    }));

    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const m of motes) {
        m.y -= m.v / 300;
        if (m.y < 0) m.y = 1;
        const alpha = 0.25 + 0.3 * Math.sin(t / 700 + m.p);
        ctx.beginPath();
        ctx.arc(m.x * W + Math.sin(t / 2000 + m.p) * 14, m.y * H, m.r, 0, 7);
        ctx.fillStyle = `rgba(255,196,110,${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} id="motes" aria-hidden="true" />;
}
