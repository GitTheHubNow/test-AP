import { describe, it, expect } from 'vitest';
import { buildStatement, statementNumber } from '../build';

const ev = (title: string, price: number, iso: string, type: 'MEMORIAL_CREATED' | 'TRIBUTE_VIDEO_RENDERED' = 'MEMORIAL_CREATED') => ({
  type, memorialId: `m_${title}`, memorialTitle: title, unitPriceCents: price, note: null, occurredAt: new Date(iso),
});

describe('buildStatement', () => {
  it('base fee + 2 memorials = $99 + 2×$199 = $497', () => {
    const b = buildStatement({
      periodLabel: 'September 2026', includeBaseFee: true, baseFeeCents: 9900,
      events: [ev('Jane Smith', 19900, '2026-09-05T00:00:00Z'), ev('John Doe', 19900, '2026-09-10T00:00:00Z')],
    });
    expect(b.baseFeeCents).toBe(9900);
    expect(b.usageCents).toBe(39800);
    expect(b.totalCents).toBe(49700);
    expect(b.lines).toHaveLength(3);
    expect(b.lines[0].kind).toBe('BASE_FEE');
  });

  it('omits the base fee line when it does not apply (e.g. still in trial)', () => {
    const b = buildStatement({ periodLabel: 'x', includeBaseFee: false, baseFeeCents: 9900, events: [ev('A', 19900, '2026-09-05T00:00:00Z')] });
    expect(b.baseFeeCents).toBe(0);
    expect(b.totalCents).toBe(19900);
    expect(b.lines.some((l) => l.kind === 'BASE_FEE')).toBe(false);
  });

  it('orders usage lines chronologically regardless of input order', () => {
    const b = buildStatement({
      periodLabel: 'x', includeBaseFee: false, baseFeeCents: 0,
      events: [ev('Late', 100, '2026-09-20T00:00:00Z'), ev('Early', 100, '2026-09-02T00:00:00Z')],
    });
    expect(b.lines.map((l) => l.memorialId)).toEqual(['m_Early', 'm_Late']);
  });

  it('keeps $0 (trial / uncharged) events as lines but adds nothing to the total', () => {
    const b = buildStatement({
      periodLabel: 'x', includeBaseFee: true, baseFeeCents: 9900,
      events: [ev('Trial', 0, '2026-09-02T00:00:00Z'), ev('Vid', 0, '2026-09-03T00:00:00Z', 'TRIBUTE_VIDEO_RENDERED')],
    });
    expect(b.totalCents).toBe(9900);
    expect(b.lines).toHaveLength(3);
  });

  it('every usage line traces back to its memorial', () => {
    const b = buildStatement({ periodLabel: 'x', includeBaseFee: false, baseFeeCents: 0, events: [ev('Jane Smith', 19900, '2026-09-05T00:00:00Z')] });
    expect(b.lines[0]).toMatchObject({ memorialId: 'm_Jane Smith', eventType: 'MEMORIAL_CREATED', amountCents: 19900 });
    expect(b.lines[0].description).toContain('Jane Smith');
  });

  it('line amounts always sum to the total', () => {
    const b = buildStatement({
      periodLabel: 'x', includeBaseFee: true, baseFeeCents: 12345,
      events: [ev('A', 777, '2026-09-02T00:00:00Z'), ev('B', 1, '2026-09-03T00:00:00Z')],
    });
    expect(b.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(b.totalCents);
  });
});

describe('statementNumber', () => {
  it('is deterministic and embeds the period', () => {
    const n = statementNumber('clx123abcdefgh', '2026-09');
    expect(n).toBe(statementNumber('clx123abcdefgh', '2026-09'));
    expect(n.startsWith('AP-202609-')).toBe(true);
  });
  it('differs between sites', () => {
    expect(statementNumber('aaaaaaaaaaaaaaaa1', '2026-09')).not.toBe(statementNumber('aaaaaaaaaaaaaaaa2', '2026-09'));
  });
});
