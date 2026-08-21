// lib/timingSafe.ts
//
// Constant-time comparisons for secret/token material — CRON_SECRET
// (isValidCronSecret) and any other application-code string comparison
// against a secret (timingSafeStringEqual), e.g. publicToken checked in
// app/api/memorial-access/unlock/route.ts.
//
// Plain `a !== b` string comparisons short-circuit on the first
// differing byte, so how long the check takes can, in principle, leak
// how many leading characters of a guess were correct. None of the
// values compared here are practically brute-forceable today (long
// random secrets, or already rate-limited, or both) so this is
// defense-in-depth rather than a fix for an active exploit — but it's
// a one-line change with no downside, so every such comparison in this
// codebase should go through here rather than a bare !==.

import { timingSafeEqual } from 'crypto';

/**
 * Constant-time equality check for two strings of secret/token material
 * (e.g. publicToken, acceptToken compared in application code rather
 * than via a DB WHERE clause). Returns false — never throws — if either
 * value is missing or the lengths differ.
 */
export function timingSafeStringEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Returns true only if `provided` exactly matches CRON_SECRET, using a
 * constant-time comparison. Returns false (never throws) if CRON_SECRET
 * isn't set, provided is missing/empty, or the values differ.
 */
export function isValidCronSecret(provided: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
