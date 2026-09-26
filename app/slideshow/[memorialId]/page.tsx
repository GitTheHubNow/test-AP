// app/slideshow/[memorialId]/page.tsx
//
// Fullscreen slideshow page — Clerk session required.
// Designed to be opened on a laptop and cast/mirrored to a chapel TV.
//
// Rendering strategy:
//   - Server component fetches memorial name + validates access.
//   - Slideshow data (photos + music) is fetched client-side via the API
//     so the player can show a loading state and handle feature-flag errors
//     gracefully without a full page redirect.

import { redirect, notFound } from 'next/navigation';
import { auth }               from '@clerk/nextjs/server';
import { prisma }             from '@/lib/prisma';
import { SlideshowPageClient } from '@/components/slideshow/SlideshowPageClient';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

export const dynamic = 'force-dynamic';

// Minimal metadata — page is meant to be fullscreen, title shows in browser tab
// and on TV input selector.
export async function generateMetadata({ params }: Props) {
  const { memorialId } = await params;

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      title: true, firstName: true, lastName: true, preferredName: true,
      nominatedName: true, nominatedEmail: true,
      funeralDate: true, venueName: true, venueAddress: true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
    },
  });
  if (!memorial) return { title: 'Slideshow' };
  const resolved = resolveMemorialFields(memorial);
  const name =
    memorial.preferredName ||
    [resolved.firstName, resolved.lastName].filter(Boolean).join(' ') ||
    memorial.title ||
    'Memorial';
  return { title: `${name} — Slideshow` };
}

interface Props {
  params: Promise<{ memorialId: string }>;
}

export default async function SlideshowPage({ params }: Props) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Lightweight ownership check — full feature-flag check happens in the API.
  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: {
      id:            true,
      ownerId:       true,
      title:         true,
      firstName:     true,
      lastName:      true,
      preferredName: true,
      nominatedName: true, nominatedEmail: true,
      funeralDate:   true, venueName: true, venueAddress: true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
    },
  });

  if (!memorial || memorial.ownerId !== userId) notFound();

  const resolved = resolveMemorialFields(memorial);

  const displayName =
    memorial.preferredName ||
    [resolved.firstName, resolved.lastName].filter(Boolean).join(' ') ||
    memorial.title ||
    'Memorial';

  return (
    // Black page shell — SlideshowPageClient renders fixed-position content
    // that covers the viewport; this prevents any flash of white background.
    <html style={{ background: '#4f5d75' }}>
      <body style={{ margin: 0, background: '#4f5d75' }}>
        <SlideshowPageClient
          memorialId={memorialId}
          memorialName={displayName}
        />
      </body>
    </html>
  );
}
