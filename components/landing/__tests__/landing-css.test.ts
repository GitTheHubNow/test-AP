import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The landing page ships ONE stylesheet. The original design used bare element
// selectors (`nav`, `section`, `h2`, `a`, `:root`, `body`) which, dropped into a
// Next.js app, would restyle the whole dashboard. These tests make that
// impossible to reintroduce by accident.

const css = readFileSync(join(__dirname, '..', 'landing.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Top-level selector lists, descending into @media/@supports but not @keyframes. */
function selectors(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    let depth = 1, k = open + 1;
    while (depth && k < src.length) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
    const body = src.slice(open + 1, k - 1);
    if (/^@(media|supports)/.test(head)) out.push(...selectors(body));
    else if (!head.startsWith('@')) out.push(head);
    i = k;
  }
  return out;
}

const all = selectors(css);

describe('landing.css is scoped to .lp', () => {
  it('parses a realistic number of rules (the parser is working)', () => {
    expect(all.length).toBeGreaterThan(150);
  });

  it('EVERY selector is under .lp — nothing can leak onto the dashboard or any other page', () => {
    const unscoped: string[] = [];
    for (const list of all) {
      for (const part of list.split(',').map((s) => s.trim())) {
        if (!(part.startsWith('.lp') || part.startsWith('html:has(.lp)'))) unscoped.push(part);
      }
    }
    expect(unscoped).toEqual([]);
  });

  it('never targets html/body/:root directly except through the .lp wrapper', () => {
    for (const list of all) {
      for (const part of list.split(',').map((s) => s.trim())) {
        expect(part).not.toMatch(/^(html|body|:root)(?!:has\(\.lp\))/);
      }
    }
  });

  it('keyframes are namespaced so they cannot collide with the app', () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.startsWith('lp-')).toBe(true);
  });

  it('gallery slides use .shot, not .ph (the original reused .ph, which hid the phases section)', () => {
    expect(css).toMatch(/\.lp \.shot\{display:none/);
    expect(css).not.toMatch(/\.lp \.ph\{display:none/);
    expect(css).toMatch(/\.lp \.ph\{display:grid/);
  });

  it('restores the heading letter-spacing and <small> size that app-wide base styles would otherwise change', () => {
    expect(css).toMatch(/\.lp h1,\.lp h2,\.lp h3,\.lp h4,\.lp h5,\.lp h6\{letter-spacing:normal\}/);
    expect(css).toMatch(/\.lp small\{font-size:smaller\}/);
  });
});
