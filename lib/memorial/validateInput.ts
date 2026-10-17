// lib/memorial/validateInput.ts
//
// Pure input validation for memorial creation (no DB, no env) so it is cheap
// to unit-test and shared by every entry point (manual form, CSV import).
//
// Before this existed, createMemorial() trusted the request body: unbounded
// string lengths, `new Date('garbage')` becoming an Invalid Date that Prisma
// rejected as a 500, and familyContactEmail accepted verbatim even though it
// becomes a handover recipient. Returns a human-readable message on the first
// problem, or null when the input is acceptable.

export const LIMITS = {
  name:         100,
  preferred:    100,
  place:        200,
  venueName:    200,
  venueAddress: 300,
  contactName:  100,
  email:        254,
  phone:        40,
  serviceType:  50,
  maxSendAfterDays: 3650,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(v: string): boolean {
  return v.length <= LIMITS.email && EMAIL_RE.test(v);
}

type Maybe = unknown;

function str(v: Maybe, field: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return `${field} must be text`;
  if (v.trim().length > max) return `${field} must be ${max} characters or fewer`;
  return null;
}

function parseDate(v: Maybe, field: string): { err: string | null; date: Date | null } {
  if (v === undefined || v === null || v === '') return { err: null, date: null };
  if (typeof v !== 'string') return { err: `${field} must be a date`, date: null };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { err: `${field} is not a valid date`, date: null };
  return { err: null, date: d };
}

const DAY = 24 * 60 * 60 * 1000;

export function validateMemorialInput(
  input: Record<string, Maybe>,
  now: Date = new Date(),
): string | null {
  for (const f of ['firstName', 'lastName'] as const) {
    if (typeof input[f] !== 'string' || !(input[f] as string).trim()) return `${f} is required`;
    if ((input[f] as string).trim().length > LIMITS.name) return `${f} must be ${LIMITS.name} characters or fewer`;
  }

  const textChecks: Array<[string, number]> = [
    ['preferredName',     LIMITS.preferred],
    ['placeOfPassing',    LIMITS.place],
    ['venueName',         LIMITS.venueName],
    ['venueAddress',      LIMITS.venueAddress],
    ['familyContactName', LIMITS.contactName],
    ['familyContactPhone', LIMITS.phone],
    ['serviceType',       LIMITS.serviceType],
  ];
  for (const [f, max] of textChecks) {
    const e = str(input[f], f, max);
    if (e) return e;
  }

  for (const f of ['familyContactEmail', 'nominatedEmail'] as const) {
    const v = input[f];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !isValidEmail(v.trim())) return `${f} must be a valid email address`;
  }

  const birth   = parseDate(input.dateOfBirth, 'dateOfBirth');   if (birth.err)   return birth.err;
  const death   = parseDate(input.dateOfDeath, 'dateOfDeath');   if (death.err)   return death.err;
  const funeral = parseDate(input.funeralDate, 'funeralDate');   if (funeral.err) return funeral.err;
  const service = parseDate(input.serviceTime, 'serviceTime');   if (service.err) return service.err;

  const earliest = new Date('1800-01-01').getTime();
  if (birth.date && (birth.date.getTime() < earliest || birth.date.getTime() > now.getTime() + DAY)) {
    return 'dateOfBirth is out of range';
  }
  if (death.date && (death.date.getTime() < earliest || death.date.getTime() > now.getTime() + DAY)) {
    return 'dateOfDeath cannot be in the future';
  }
  if (birth.date && death.date && birth.date.getTime() > death.date.getTime()) {
    return 'dateOfBirth must be before dateOfDeath';
  }
  const maxFuture = now.getTime() + 2 * 365 * DAY;
  for (const [d, f] of [[funeral.date, 'funeralDate'], [service.date, 'serviceTime']] as const) {
    if (d && (d.getTime() < earliest || d.getTime() > maxFuture)) return `${f} is out of range`;
  }

  if (input.sendAfterDays !== undefined && input.sendAfterDays !== null) {
    const n = input.sendAfterDays;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > LIMITS.maxSendAfterDays) {
      return `sendAfterDays must be a whole number between 0 and ${LIMITS.maxSendAfterDays}`;
    }
  }

  for (const f of ['isAboriginal', 'isTorresStraitIslander', 'isSouthSeaIslander', 'isMaori'] as const) {
    const v = input[f];
    if (v !== undefined && v !== null && typeof v !== 'boolean') return `${f} must be true or false`;
  }

  return null;
}
