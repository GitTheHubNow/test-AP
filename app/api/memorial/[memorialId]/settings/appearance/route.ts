import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * GET  /api/memorial/[memorialId]/settings/appearance
 * PATCH /api/memorial/[memorialId]/settings/appearance
 *
 * Org-scoped access (previously "Owner-only" via a manual ownerId check
 * that blocked org staff — fixed to use assertMemorialAccess). Manages
 * the MemorialSettings record for a memorial. GET creates the record
 * with defaults if it doesn't exist yet (upsert on read).
 *
 * NOTE: there is also a separate app/api/memorial/[memorialId]/appearance/
 * route.ts with overlapping purpose — both were found to have the same
 * manual-ownerId bug during this sweep and both are fixed, but the
 * duplication itself (two routes managing similar/overlapping settings)
 * is worth consolidating in a follow-up, not addressed here.
 *
 * Phase 4A
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await assertMemorialAccess(memorialId, userId, 'read');

    // Upsert — create with defaults if first visit
    const settings = await prisma.memorialSettings.upsert({
      where:  { memorialId: memorialId },
      create: { memorialId: memorialId },
      update: {},
    });

    return NextResponse.json({ success: true, data: { settings } });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[GET /api/memorial/[memorialId]/settings/appearance]', error);
    return NextResponse.json({ success: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await assertMemorialAccess(memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { sealed: true },
    });

    if (!memorial) {
      return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
    }

    if (memorial.sealed) {
      return NextResponse.json(
        { success: false, error: 'Sealed memorials cannot be modified' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      primaryColor,
      backgroundColor,
      fontFamily,
      showTimeline,
      showGallery,
      showGuestBook,
      showMemoryCount,
      guestBookTitle,
      guestBookPrompt,
    } = body as {
      primaryColor?:     string | null;
      backgroundColor?:  string | null;
      fontFamily?:       string | null;
      showTimeline?:     boolean;
      showGallery?:      boolean;
      showGuestBook?:    boolean;
      showMemoryCount?:  boolean;
      guestBookTitle?:   string | null;
      guestBookPrompt?:  string | null;
    };

    // Validate hex colors if provided
    const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    if (primaryColor    && !hexRegex.test(primaryColor))    {
      return NextResponse.json({ success: false, error: 'Invalid primaryColor hex value' }, { status: 400 });
    }
    if (backgroundColor && !hexRegex.test(backgroundColor)) {
      return NextResponse.json({ success: false, error: 'Invalid backgroundColor hex value' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (primaryColor     !== undefined) updateData.primaryColor     = primaryColor;
    if (backgroundColor  !== undefined) updateData.backgroundColor  = backgroundColor;
    if (fontFamily       !== undefined) updateData.fontFamily        = fontFamily;
    if (showTimeline     !== undefined) updateData.showTimeline      = showTimeline;
    if (showGallery      !== undefined) updateData.showGallery       = showGallery;
    if (showGuestBook    !== undefined) updateData.showGuestBook     = showGuestBook;
    if (showMemoryCount  !== undefined) updateData.showMemoryCount   = showMemoryCount;
    if (guestBookTitle   !== undefined) updateData.guestBookTitle    = guestBookTitle;
    if (guestBookPrompt  !== undefined) updateData.guestBookPrompt   = guestBookPrompt;

    const settings = await prisma.memorialSettings.upsert({
      where:  { memorialId: memorialId },
      create: { memorialId: memorialId, ...updateData },
      update: updateData,
    });

    return NextResponse.json({ success: true, data: { settings } });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH /api/memorial/[memorialId]/settings/appearance]', error);
    return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
  }
}
