import { describe, it, expect } from 'vitest';
import {
  planBulkBatch, narrowPlan, resolveMimeType, isBulkKeyForMemorial, titleFromFileName, BULK_LIMITS, formatBytes,
} from '@/lib/bulk-upload';

const MB = 1024 * 1024;
const GB = 1024 * MB;
const f = (name: string, size: number, type = '') => ({ name, type, size });

describe('resolveMimeType', () => {
  it('keeps an accepted declared type', () => expect(resolveMimeType('a.jpg', 'image/jpeg')).toBe('image/jpeg'));
  it('guesses HEIC from the extension when the browser sends nothing', () => {
    expect(resolveMimeType('IMG_1.HEIC', '')).toBe('image/heic');
    expect(resolveMimeType('clip.MOV', 'application/octet-stream')).toBe('video/quicktime');
  });
  it('returns empty for unknown', () => expect(resolveMimeType('x.exe', 'application/x-msdownload')).toBe(''));
});

describe('planBulkBatch', () => {
  it('accepts supported files and classifies them', () => {
    const p = planBulkBatch([f('a.jpg', MB), f('b.mp4', 10 * MB), f('c.pdf', MB)], 5 * GB);
    expect(p.rejected).toEqual([]);
    expect(p.accepted.map((a) => a.type)).toEqual(['PHOTO', 'VIDEO', 'DOCUMENT']);
    expect(p.acceptedBytes).toBe(12 * MB);
  });
  it('rejects unsupported, empty, and oversize files with reasons', () => {
    const p = planBulkBatch([f('x.exe', MB), f('e.jpg', 0), f('big.jpg', 51 * MB), f('ok.mp4', 200 * MB)], 5 * GB);
    expect(p.rejected.map((r) => r.reason)).toEqual([
      'Unsupported file type', 'File is empty', expect.stringMatching(/Too large/),
    ]);
    expect(p.accepted).toHaveLength(1);
  });
  it('never goes over the remaining storage — takes files in order until full', () => {
    const files = Array.from({ length: 10 }, (_, i) => f(`p${i}.jpg`, 10 * MB));
    const p = planBulkBatch(files, 35 * MB); // room for exactly 3
    expect(p.accepted.map((a) => a.name)).toEqual(['p0.jpg', 'p1.jpg', 'p2.jpg']);
    expect(p.rejected).toHaveLength(7);
    expect(p.rejected[0].reason).toMatch(/storage limit/);
    expect(p.acceptedBytes).toBeLessThanOrEqual(35 * MB);
  });
  it('a small file after a too-big one can still fit', () => {
    const p = planBulkBatch([f('big.mp4', 150 * MB), f('small.jpg', MB)], 100 * MB);
    expect(p.accepted.map((a) => a.name)).toEqual(['small.jpg']);
  });
  it('handles exactly-full and zero remaining', () => {
    expect(planBulkBatch([f('a.jpg', 10 * MB)], 10 * MB).accepted).toHaveLength(1);
    expect(planBulkBatch([f('a.jpg', 1)], 0).accepted).toHaveLength(0);
  });
  it('tolerates garbage input without throwing', () => {
    const p = planBulkBatch([{ name: 5, type: null, size: 'x' } as any, null as any], 1 * GB);
    expect(p.accepted).toHaveLength(0);
    expect(p.rejected).toHaveLength(2);
  });
  it('respects the 5GB memorial cap end to end', () => {
    // 5GB cap with 4.9GB already used → only ~100MB can still be added
    const used = 4.9 * GB, limit = 5 * GB;
    const p = planBulkBatch(Array.from({ length: 5 }, (_, i) => f(`v${i}.mp4`, 40 * MB)), limit - used);
    expect(p.acceptedBytes).toBeLessThanOrEqual(limit - used);
    expect(p.accepted.length).toBe(2);
  });
});

describe('isBulkKeyForMemorial', () => {
  const id = 'cmvc67fac0002w3mfkb5nttqm';
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  it('accepts keys the prepare step issues', () => {
    expect(isBulkKeyForMemorial(`collection/${id}/${uuid}.jpg`, id)).toBe(true);
  });
  it('rejects other memorials, traversal and odd shapes', () => {
    expect(isBulkKeyForMemorial(`collection/OTHER/${uuid}.jpg`, id)).toBe(false);
    expect(isBulkKeyForMemorial(`collection/${id}/../x/${uuid}.jpg`, id)).toBe(false);
    expect(isBulkKeyForMemorial(`collection/${id}/${uuid}.jpg/extra`, id)).toBe(false);
    expect(isBulkKeyForMemorial(`memorials/${id}/uploads/${uuid}.jpg`, id)).toBe(false);
    expect(isBulkKeyForMemorial(42, id)).toBe(false);
    expect(isBulkKeyForMemorial(`collection/a.b/${uuid}.jpg`, 'a.b')).toBe(false);
  });
});

describe('helpers', () => {
  it('titles', () => { expect(titleFromFileName('IMG_4821.JPG')).toBe('IMG_4821'); expect(titleFromFileName('.jpg').length).toBeGreaterThan(0); });
  it('formatBytes', () => { expect(formatBytes(5 * GB)).toBe('5.00 GB'); expect(formatBytes(1536 * 1024)).toBe('1.5 MB'); });
  it('limits match the single-file routes', () => {
    expect(BULK_LIMITS.maxBytes.PHOTO).toBe(50 * MB);
    expect(BULK_LIMITS.maxBytes.VIDEO).toBe(200 * MB);
  });
});

describe('narrowPlan (public family link rules)', () => {
  const base = () => planBulkBatch([f('a.jpg', MB), f('b.mp4', MB), f('c.png', MB), f('d.jpg', MB)], 5 * GB);

  it('photos-only drops videos/documents with a reason, keeps order', () => {
    const n = narrowPlan(base(), { allowedTypes: ['PHOTO'] });
    expect(n.accepted.map((a) => a.name)).toEqual(['a.jpg', 'c.png', 'd.jpg']);
    expect(n.rejected).toEqual([{ index: 1, name: 'b.mp4', reason: 'Unsupported file type' }]);
  });
  it('caps how many files a link may still accept', () => {
    const n = narrowPlan(base(), { allowedTypes: ['PHOTO'], maxAccept: 2 });
    expect(n.accepted.map((a) => a.name)).toEqual(['a.jpg', 'c.png']);
    expect(n.rejected.map((r) => r.name)).toEqual(['b.mp4', 'd.jpg']);
  });
  it('maxAccept 0 (link exhausted) accepts nothing', () => {
    expect(narrowPlan(base(), { maxAccept: 0 }).accepted).toHaveLength(0);
  });
  it('no options = unchanged', () => {
    const p = base();
    expect(narrowPlan(p, {})).toEqual({ accepted: p.accepted, rejected: p.rejected });
  });
});
