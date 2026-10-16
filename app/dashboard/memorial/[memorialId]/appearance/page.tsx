// app/dashboard/memorial/[memorialId]/appearance/page.tsx

import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { getPublicUrl } from '@/lib/upload-shared';
import { ensurePublicToken } from '@/lib/qr';
import { AppearanceEditor } from '@/components/memorial/AppearanceEditor';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

export default async function AppearancePage({ params }: { params: Promise<{ memorialId: string }> }) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) notFound();

  // Was `where: { id, ownerId: userId }`: only the staff member who CREATED the
  // memorial could open this page (colleagues got a 404), and after a direct
  // handover that creator is still ownerId — so it also let them straight past
  // the handed-over cut-off. assertMemorialAccess applies the real rules.
  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where: { id: memorialId },
    select: {
      id:           true,
      firstName:    true,
      lastName:     true,
      heroImageKey: true,
      slug:         true,
      publicToken:  true,
      nominatedName:  true,
      nominatedEmail: true,
      funeralDate:    true,
      venueName:      true,
      venueAddress:   true,
      funeralCase: {
        select: {
          deceasedName: true, serviceDate: true,
          familyContact: true, contactEmail: true,
          venueName: true, venueAddress: true,
        },
      },
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

  const displayName = (() => {
    const { firstName, lastName } = resolveMemorialFields(memorial);
    return [firstName, lastName].filter(Boolean).join(' ') || 'Memorial';
  })();

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
