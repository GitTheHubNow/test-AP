// lib/memorial/slug.ts
//
// Generates the clean, human-readable URL slug for a memorial
// (e.g. "John Smith" -> "john-smith"). This is the PUBLIC-FACING path
// segment (memoriam.com/john-smith) — it is NOT a secret. The actual
// access control is the `key` query param checked in app/[slug]/page.tsx,
// which is the existing long random token. Two different jobs:
//   - slug:  human-readable, guessable, fine to be public
//   - key:   the real secret, unguessable, gates the content
//
// Replaces the old /m/[token] route entirely — token-only URLs are
// retired once this is wired in (see app/[slug]/page.tsx).

import { prisma } from '@/lib/prisma';

// Reserved top-level path segments — a generated slug must never collide
// with one of these, since Next.js would never even reach app/[slug]
// for these paths (they're matched by more specific routes first), but
// a memorial literally named "Dashboard" or "Admin" could otherwise
// generate a slug that's confusingly unreachable or shadows a real route.
const RESERVED_SLUGS = new Set([
  'dashboard', 'sign-in', 'sign-up', 'collect', 'handover', 'm',
  'memorial', 'slideshow', 'upload', 'v', 'api', 'admin', 'system',
  'about', 'contact', 'privacy', 'terms', 'help', 'support',
  '_next', 'favicon.ico',
]);

/**
 * Converts a name into a URL-safe base slug.
 * "John O'Smith-Jones" -> "john-osmith-jones"
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')    // strip punctuation
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generates a unique, non-reserved slug for a new memorial.
 *
 * Strategy: base slug from name, append -2, -3, etc. on collision.
 * Falls back to a random suffix if the name produces an empty slug
 * (e.g. name is entirely non-Latin characters not covered by the
 * accent-stripping above) — should be rare but must not crash memorial
 * creation if it happens.
 */
export async function generateUniqueSlug(
  firstName: string,
  lastName: string,
): Promise<string> {
  const base = slugify(`${firstName} ${lastName}`) || `memorial-${Date.now().toString(36)}`;

  let candidate = base;
  let suffix = 1;

  // Loop guard: 50 attempts is far more than any realistic name collision
  // count; beyond that something is wrong (e.g. the query itself is
  // broken) and we should fail loudly rather than loop forever.
  for (let attempts = 0; attempts < 50; attempts++) {
    const isReserved = RESERVED_SLUGS.has(candidate);
    const existing = isReserved
      ? true // treat reserved words as "taken" so we skip past them
      : !!(await prisma.memorial.findFirst({
          where: { slug: candidate },
          select: { id: true },
        }));

    if (!existing) return candidate;

    suffix++;
    candidate = `${base}-${suffix}`;
  }

  throw new Error(`generateUniqueSlug: exhausted attempts for base "${base}"`);
}

