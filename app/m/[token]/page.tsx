// app/m/[token]/page.tsx
//
// RETIRED ROUTE — kept only as a redirect shim.
//
// This used to be the full public memorial view, addressed by qrTokenHash
// (V1 scheme). Public viewing has moved to /v/[slug]?key={publicToken}
// (see app/v/[slug]/page.tsx). This page now does nothing but look the
// memorial up by its old token and 301-redirect to the new URL, so that
// any QR codes already printed, or links already sent in old emails,
// keep working instead of 404ing.
//
// Do not add real content back here — if you need to change what a public
// visitor sees, change app/v/[slug]/page.tsx.

import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ensurePublicToken } from '@/lib/qr';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function LegacyMemorialRedirect({ params }: Props) {
  const { token } = await params;

  const memorial = await prisma.memorial.findFirst({
    where:  { OR: [{ id: token }, { qrTokenHash: token }] },
    select: { id: true, slug: true, publicToken: true },
  });

  if (!memorial) notFound();

  // publicToken is generated lazily elsewhere (see app/api/memorials/[id]/qr/
  // route.ts) — ensurePublicToken generates and persists one if missing, so
  // an old QR code never dead-ends even if nobody has opened this
  // memorial's QR panel yet.
  const publicToken = await ensurePublicToken(memorial.id, memorial.publicToken);
  const slug = memorial.slug ?? memorial.id;
  redirect(`/v/${slug}?key=${publicToken}`);
}
