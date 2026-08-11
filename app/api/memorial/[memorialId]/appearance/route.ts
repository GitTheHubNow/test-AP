// app/api/memorial/[memorialId]/appearance/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    // FIXED: previously embedded the ownership check directly in the
    // Prisma `where` clause (`ownerId: userId`), which blocked org staff
    // the same way every other manual check in this sweep did.
    await assertMemorialAccess(params.memorialId, userId, 'edit');

    const body = await req.json();
    const {
      theme,
      heroLayout,
      fontFamily,
      primaryColor,
      backgroundColor,
      showGallery,
      showGuestBook,
      guestBookTitle,
      guestBookPrompt,
    } = body;

    const settings = await prisma.memorialSettings.upsert({
      where:  { memorialId: params.memorialId },
      create: {
        memorialId:      params.memorialId,
        theme:           theme           ?? 'light',
        heroLayout:      heroLayout      ?? 'full-bleed',
        fontFamily:      fontFamily      ?? null,
        primaryColor:    primaryColor    ?? null,
        backgroundColor: backgroundColor ?? null,
        showGallery:     showGallery     ?? true,
        showGuestBook:   showGuestBook   ?? true,
        guestBookTitle:  guestBookTitle  ?? null,
        guestBookPrompt: guestBookPrompt ?? null,
      },
      update: {
        ...(theme           !== undefined && { theme }),
        ...(heroLayout      !== undefined && { heroLayout }),
        ...(fontFamily      !== undefined && { fontFamily }),
        ...(primaryColor    !== undefined && { primaryColor }),
        ...(backgroundColor !== undefined && { backgroundColor }),
        ...(showGallery     !== undefined && { showGallery }),
        ...(showGuestBook   !== undefined && { showGuestBook }),
        ...(guestBookTitle  !== undefined && { guestBookTitle }),
        ...(guestBookPrompt !== undefined && { guestBookPrompt }),
      },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      return handleAuthError(err);
    }
    console.error('[appearance PATCH]', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

// Helper — also expose GET so the editor can load current settings
export async function GET(
  req: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    // FIXED: this handler previously had NO access check at all — any
    // authenticated user could read any memorial's appearance settings
    // by ID, not just staff at the owning org.
    await assertMemorialAccess(params.memorialId, userId, 'read');

    const settings = await prisma.memorialSettings.findUnique({
      where: { memorialId: params.memorialId },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}
