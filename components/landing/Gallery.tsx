'use client';

// "See what is behind every memorial." — a tabbed gallery of real product
// screenshots. Each screenshot has its personal-name areas blanked, with the demo
// name drawn back on top as an overlay whose font size scales with the rendered
// image width (so it stays the right size on every screen).

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image, { type StaticImageData } from 'next/image';
import tributeVideo from '../../public/landing/tribute-video.jpg';
import permanentQr from '../../public/landing/permanent-qr.jpg';
import publishChecklist from '../../public/landing/publish-checklist.jpg';
import appearance from '../../public/landing/appearance.jpg';
import guestBook from '../../public/landing/guest-book.jpg';
import slideshow from '../../public/landing/slideshow.jpg';

const DEMO_NAME = 'Eleanor Hawthorne';
const GEORGIA = "Georgia,'Times New Roman',serif";

interface Overlay {
  left: string; top: string; k: number; color: string; font: string; weight: number;
  transform: string; width?: string; clip?: boolean;
}
interface Shot { title: string; blurb: string; alt: string; src: StaticImageData; overlays: Overlay[] }

const SHOTS: Shot[] = [
  {
    title: 'Tribute video',
    blurb: 'Pick a theme, add music and opening and closing cards. It renders in the browser, with no upload.',
    alt: 'Tribute video editor with themes and music', src: tributeVideo,
    overlays: [
      { left: '58.89%', top: '4.14%',  k: 0.01239, color: 'rgb(205, 186, 147)', font: GEORGIA, weight: 400, transform: 'translateY(-50%)' },
      { left: '23.40%', top: '12.30%', k: 0.01239, color: 'rgb(244, 241, 234)', font: GEORGIA, weight: 400, transform: 'translateY(-50%)' },
      { left: '67.78%', top: '19.80%', k: 0.0073,  color: 'rgb(205, 186, 147)', font: GEORGIA, weight: 700, transform: 'translate(-50%,-50%)' },
      { left: '62.46%', top: '70.36%', k: 0.01239, color: 'rgb(201, 194, 232)', font: GEORGIA, weight: 400, transform: 'translateY(-50%)', width: '4.37%', clip: true },
    ],
  },
  {
    title: 'Permanent QR',
    blurb: 'One QR for life. It shows the service pamphlet first, then the memorial once it unlocks.',
    alt: 'Permanent QR code and memorial journey', src: permanentQr,
    overlays: [
      { left: '50.00%', top: '12.73%', k: 0.0719, color: 'rgb(26, 14, 5)', font: "'Cormorant Garamond',Georgia,serif", weight: 500, transform: 'translate(-50%,-50%)' },
    ],
  },
  {
    title: 'Publish checklist',
    blurb: 'Publish with a name, one memory and family consent. Everything else is optional.',
    alt: 'Publish checklist with family consent', src: publishChecklist, overlays: [],
  },
  {
    title: 'Appearance',
    blurb: 'Light, warm, slate or dark, with accent colours, layout and fonts, previewed instantly.',
    alt: 'Appearance settings with colour modes', src: appearance, overlays: [],
  },
  {
    title: 'Guest book',
    blurb: 'Approve messages, pin the best to the top and delete anything inappropriate.',
    alt: 'Guest book moderation', src: guestBook,
    overlays: [
      { left: '23.40%', top: '12.30%', k: 0.01239, color: 'rgb(244, 241, 234)', font: GEORGIA, weight: 400, transform: 'translateY(-50%)' },
      { left: '55.54%', top: '13.31%', k: 0.0109,  color: 'rgb(152, 162, 179)', font: GEORGIA, weight: 400, transform: 'translateY(-50%)' },
    ],
  },
  {
    title: 'Slideshow',
    blurb: 'Play approved photos at the service with captions and keyboard or touch controls.',
    alt: 'Tribute slideshow controls', src: slideshow,
    overlays: [
      { left: '25.50%', top: '18.22%', k: 0.01737, color: 'rgb(132, 132, 138)', font: "system-ui,-apple-system,'Segoe UI',sans-serif", weight: 400, transform: 'translateY(-50%)' },
    ],
  },
];

const overlayStyle = (o: Overlay): CSSProperties =>
  ({
    left: o.left, top: o.top, ['--k' as string]: o.k, color: o.color, fontFamily: o.font,
    fontWeight: o.weight, transform: o.transform,
    ...(o.width ? { width: o.width } : {}), ...(o.clip ? { overflow: 'hidden' } : {}),
  }) as CSSProperties;

export function Gallery() {
  const [active, setActive] = useState(0);
  const slides = useRef<(HTMLSpanElement | null)[]>([]);

  // Keep --w (the rendered image width) current on the visible slide so the
  // overlay text scales with it. Covers tab switches, image load and any resize.
  useEffect(() => {
    const slide = slides.current[active];
    const img = slide?.querySelector('img');
    if (!slide || !img) return;
    const fit = () => slide.style.setProperty('--w', `${img.clientWidth}px`);
    fit();
    img.addEventListener('load', fit);
    const ro = new ResizeObserver(fit);
    ro.observe(img);
    return () => { img.removeEventListener('load', fit); ro.disconnect(); };
  }, [active]);

  return (
    <div className="gal rv">
      <div className="gt" role="group" aria-label="Product screens">
        {SHOTS.map((s, i) => (
          <button key={s.title} type="button" className={`stp ${i === active ? 'on' : ''}`} aria-pressed={i === active} onClick={() => setActive(i)}>
            <div><b>{s.title}</b><span>{s.blurb}</span></div>
          </button>
        ))}
      </div>
      <div className="gs">
        {SHOTS.map((s, i) => (
          <span key={s.title} ref={(el) => { slides.current[i] = el; }} className={`shot ${i === active ? 'on' : ''}`}>
            <Image src={s.src} alt={s.alt} sizes="(max-width: 860px) 92vw, 640px" />
            {s.overlays.map((o, j) => (
              <span key={j} className="ov" aria-hidden="true" style={overlayStyle(o)}>{DEMO_NAME}</span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
