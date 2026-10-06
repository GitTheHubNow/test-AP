// app/api/memorial/[memorialId]/appearance/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { validateAppearanceSettings } from '@/lib/memorial/validateAppearanceSettings';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    // FIXED: previously embedded the ownership check directly in the
    // Prisma `where` clause (`ownerId: userId`), which blocked org staff
    // the same way every other manual check in this sweep did.
    await assertMemorialAccess(memorialId, userId, 'edit');

    const body = await req.json();
    const validated = validateAppearanceSettings(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const data = validated.data;

    const settings = await prisma.memorialSettings.upsert({
      where:  { memorialId: memorialId },
      create: {
        memorialId:      memorialId,
        theme:           data.theme           ?? 'light',
        heroLayout:      data.heroLayout      ?? 'full-bleed',
        ...data,
      },
      update: data,
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
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    // FIXED: this handler previously had NO access check at all — any
    // authenticated user could read any memorial's appearance settings
    // by ID, not just staff at the owning org.
    await assertMemorialAccess(memorialId, userId, 'read');

    const settings = await prisma.memorialSettings.findUnique({
      where: { memorialId: memorialId },
    });

    return NextResponse.json({ settings });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      return handleAuthError(err);
    }
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}
