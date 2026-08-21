// app/dashboard/memorial/[memorialId]/appearance/page.tsx

import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { getPublicUrl } from '@/lib/upload-shared';
import { ensurePublicToken } from '@/lib/qr';
import { AppearanceEditor } from '@/components/memorial/AppearanceEditor';

export default async function AppearancePage({ params }: { params: Promise<{ memorialId: string }> }) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) notFound();

  const memorial = await prisma.memorial.findFirst({
    where: { id: memorialId, ownerId: userId },
    select: {
      id:           true,
      firstName:    true,
      lastName:     true,
      heroImageKey: true,
      slug:         true,
      publicToken:  true,
      collectionItems: {
        where:   { type: 'PHOTO', status: 'APPROVED', isHero: true },
        select:  { blobKey: true },
        take:    1,
      },
      settings: {
        select: {
          theme:           true,
          heroLayout:      true,
          fontFamily:      true,
          primaryColor:    true,
          showGallery:     true,
          showGuestBook:   true,
          guestBookTitle:  true,
          guestBookPrompt: true,
        },
      },
    },
  });
  if (!memorial) notFound();

  const displayName = [memorial.firstName, memorial.lastName].filter(Boolean).join(' ') || 'Memorial';

  // publicToken is generated lazily (see app/api/memorials/[id]/qr/route.ts) —
  // generate it here too so "View live" is never a dead link from this editor.
  const publicToken = await ensurePublicToken(memorialId, memorial.publicToken);
  const publicHref = `/v/${memorial.slug ?? memorialId}?key=${publicToken}`;

  const heroUrl = memorial.heroImageKey
    ? getPublicUrl(memorial.heroImageKey)
    : memorial.collectionItems[0]?.blobKey
      ? getPublicUrl(memorial.collectionItems[0].blobKey)
      : null;

  const initial = {
    theme:           (memorial.settings?.theme        as any) ?? 'light',
    heroLayout:      (memorial.settings?.heroLayout   as any) ?? 'full-bleed',
    fontFamily:      (memorial.settings?.fontFamily   as any) ?? 'serif',
    primaryColor:    memorial.settings?.primaryColor  ?? '#1c1917',
    showGallery:     memorial.settings?.showGallery   ?? true,
    showGuestBook:   memorial.settings?.showGuestBook ?? true,
    guestBookTitle:  memorial.settings?.guestBookTitle  ?? 'Guest Book',
    guestBookPrompt: memorial.settings?.guestBookPrompt ?? 'Share a memory or message...',
  };

  return (
    <AppearanceEditor
      memorialId={memorial.id}
      displayName={displayName}
      heroUrl={heroUrl}
      initial={initial}
      publicHref={publicHref}
    />
  );
}
