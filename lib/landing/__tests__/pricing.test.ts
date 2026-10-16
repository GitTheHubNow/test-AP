import { describe, it, expect } from 'vitest';
import { yearlyProfit, marginPerMemorial, formatUsd, clamp, WHOLESALE_FEE, RETAIL_DEFAULT, SUBSCRIPTION } from '../pricing';
import { qrPathData, slugify, initials } from '../qr';

describe('margin calculator maths (must match the design exactly)', () => {
  it('default state: 10 cases at $899 → $600 margin, $70,911 a year (the figures printed on the page)', () => {
    expect(marginPerMemorial(RETAIL_DEFAULT)).toBe(600);
    expect(yearlyProfit(10, 899)).toBe(70911);
    expect(formatUsd(yearlyProfit(10, 899))).toBe('$70,911');
  });
  it('subscription is charged for 11 months — the first is free', () => {
    expect(yearlyProfit(0, 899)).toBe(-SUBSCRIPTION * 11);
  });
  it('scales linearly with cases and price', () => {
    expect(yearlyProfit(1, 699)).toBe(1 * 400 * 12 - 1089);
    expect(yearlyProfit(30, 999)).toBe(30 * 700 * 12 - 1089);
  });
  it('formatUsd groups thousands, rounds, and keeps the sign on a loss', () => {
    expect(formatUsd(1234567)).toBe('$1,234,567');
    expect(formatUsd(599.6)).toBe('$600');
    expect(formatUsd(-1089)).toBe('-$1,089');
    expect(formatUsd(0)).toBe('$0');
  });
  it('clamp keeps slider values in range and survives NaN', () => {
    expect(clamp(5, 1, 30)).toBe(5);
    expect(clamp(99, 1, 30)).toBe(30);
    expect(clamp(-4, 1, 30)).toBe(1);
    expect(clamp(NaN, 1, 30)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN MISMATCH — resolve before launch.
// The landing page promises a $299 wholesale fee per memorial, due at handover.
// lib/billing/pricing.ts charges $199, recorded when the memorial is created.
// This documents today's state so the gap can't be forgotten; when the owner
// decides the real price, change ONE of the two numbers and convert this
// to a normal passing assertion.
// ─────────────────────────────────────────────────────────────────────────────
describe('landing pricing vs billing system', () => {
  it.todo('WHOLESALE_FEE (landing, $299) equals the billing default per-memorial fee (billing, $199)');
  it('records the current landing wholesale fee', () => {
    expect(WHOLESALE_FEE).toBe(299);
  });
});

describe('demo QR pattern', () => {
  it('is deterministic for a seed and different for different seeds', () => {
    expect(qrPathData('eleanor-hawthorne')).toBe(qrPathData('eleanor-hawthorne'));
    expect(qrPathData('eleanor-hawthorne')).not.toBe(qrPathData('arthur-pendleton'));
  });
  it('always has the three finder squares and stays inside the 21×21 grid', () => {
    const d = qrPathData('x');
    for (const f of ['M0 0h7v7h-7z', 'M14 0h7v7h-7z', 'M0 14h7v7h-7z']) expect(d).toContain(f);
    const cells = [...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(cells.length).toBeGreaterThan(50);
    for (const [x, y] of cells) { expect(x).toBeLessThan(21); expect(y).toBeLessThan(21); }
  });
});

describe('name helpers', () => {
  it('slugify', () => {
    expect(slugify('Eleanor Hawthorne')).toBe('eleanor-hawthorne');
    expect(slugify("  O'Brien & Sons!! ")).toBe('o-brien-sons');
    expect(slugify('')).toBe('memorial');
    expect(slugify('***')).toBe('memorial');
  });
  it('initials', () => {
    expect(initials('Eleanor Hawthorne')).toBe('EH');
    expect(initials('Madonna')).toBe('M');
    expect(initials('Mary Jane Watson')).toBe('MJ');
    expect(initials('   ')).toBe('');
  });
});
