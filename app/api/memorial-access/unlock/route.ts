// app/api/memorial-access/unlock/route.ts
//
// Sets the "remembered" unlock cookie for a memorial after a visitor has
// arrived via a valid ?key= link. Called once, client-side, by
// MemorialPageClient on mount when the server component determined
// needsCookieSet=true (see app/[slug]/page.tsx).
//
// Deliberately re-validates the key server-side rather than trusting the
// client's claim that it's valid — the client could be tampered with,
// this route is the actual authority.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year, matches app/[slug]/page.tsx

export async function POST(request: NextRequest) {
  let body: { memorialId?: string; key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.memorialId || !body.key) {
    return NextResponse.json({ success: false, error: 'Missing memorialId or key' }, { status: 400 });
  }

  // This route is the real authority check for publicToken — rate limit
  // it before the DB lookup, since its whole job is standing between the
  // public internet and unbounded token-guessing against a known
  // memorialId. Global per-IP bucket (not scoped to memorialId) is
  // deliberate: scoping per-resource would let an attacker parallelize
  // guesses across many different memorials at full rate each.
  const limited = await checkRateLimit(request, 'memorial-unlock', { max: 10, windowMs: 60 * 1000 });
  if (limited) return limited;

  const memorial = await prisma.memorial.findUnique({
    where:  { id: body.memorialId },
    select: { id: true, publicToken: true },
  });

  if (!memorial || memorial.publicToken !== body.key) {
    // Deliberately vague error — don't confirm/deny whether the
    // memorialId itself is valid, only that this combination isn't.
    return NextResponse.json({ success: false, error: 'Invalid access code' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(`memorial_unlock_${memorial.id}`, memorial.publicToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  });

  return response;
}
