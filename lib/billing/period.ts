// lib/billing/period.ts
//
// Billing months, expressed as "YYYY-MM" keys and resolved to exact UTC
// instants in the BILLING timezone — so a memorial created at 9am on the
// 1st of November in Sydney is a November memorial, not an October one
// (which is what you'd get by slicing months on UTC midnight, since that
// moment is still 31 October UTC).
//
// Boundaries are half-open: [start, end). An event at exactly `end`
// belongs to the NEXT period.

const DEFAULT_TZ = 'Australia/Sydney';

export function getBillingTimezone(): string {
  const tz = process.env.BILLING_TIMEZONE || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    console.error(`[billing] Invalid BILLING_TIMEZONE "${tz}", falling back to ${DEFAULT_TZ}`);
    return DEFAULT_TZ;
  }
}

const KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidPeriodKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key);
}

function parseKey(key: string): { year: number; month: number } {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Invalid period key "${key}" — expected YYYY-MM`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

function toKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Offset (ms) of `tz` from UTC at the given instant. Positive = ahead of UTC. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of 00:00 on the 1st of (year, month) in `tz`. */
function zonedMonthStart(year: number, month: number, tz: string): Date {
  const naiveUtc = Date.UTC(year, month - 1, 1, 0, 0, 0);
  // Two passes handle months where the offset changes around the boundary.
  let t = naiveUtc - tzOffsetMs(new Date(naiveUtc), tz);
  t = naiveUtc - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

export function periodBounds(key: string, tz: string = getBillingTimezone()): { start: Date; end: Date } {
  const { year, month } = parseKey(key);
  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { start: zonedMonthStart(year, month, tz), end: zonedMonthStart(nextYear, nextMonth, tz) };
}

/** The "YYYY-MM" key of the billing month containing `at`. */
export function periodKeyFor(at: Date, tz: string = getBillingTimezone()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const year  = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

export function previousPeriodKey(key: string): string {
  const { year, month } = parseKey(key);
  return month === 1 ? toKey(year - 1, 12) : toKey(year, month - 1);
}

/** Has the billing month `key` fully ended as of `now`? Only closed months are billed. */
export function isPeriodClosed(key: string, now: Date = new Date(), tz: string = getBillingTimezone()): boolean {
  return periodBounds(key, tz).end.getTime() <= now.getTime();
}

export function formatPeriodLabel(key: string): string {
  const { year, month } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-AU', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
