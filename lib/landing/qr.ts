// lib/landing/qr.ts
//
// A DECORATIVE QR-style pattern for the marketing demo's memorial preview.
// It is deterministic for a given seed (so the pattern is stable while a
// visitor types a name) but it is NOT a real, scannable QR code — it encodes
// nothing. Pure so it can be tested and rendered as plain SVG JSX (no
// innerHTML anywhere on the landing page).

/** Returns the SVG path `d` for the three finder squares plus seeded data modules, on a 21×21 grid. */
export function qrPathData(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => (h = (h * 1664525 + 1013904223) >>> 0) / 4294967296;

  let d = '';
  const finder = (x: number, y: number) => {
    d += `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  };
  finder(0, 0); finder(14, 0); finder(0, 14);

  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      // leave the three finder zones (and their quiet border) empty
      if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue;
      if (rand() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

/** "Eleanor Hawthorne" → "eleanor-hawthorne"; empty/symbol-only → "memorial". */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'memorial';
}

/** "Eleanor Hawthorne" → "EH" (first letter of the first two words); blank → "". */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
