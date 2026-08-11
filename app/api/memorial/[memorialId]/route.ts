import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemorialStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * app/api/memorial/[memorialId]/route.ts
 *
 * GET    — fetch memorial details (org-scoped read access)
 * PATCH  — update memorial settings (org-scoped edit access)
 * DELETE — soft delete/archive memorial (org-scoped delete access)
 *
 * FIXED: all three handlers previously used a manual `ownerId !== userId`
 * check, which blocked every org staff member except the literal creator.
 * Now use assertMemorialAccess (lib/auth/getOrgForUser.ts) with the
 * appropriate action level per method, matching the rest of the API.
 *
 * Phase 3A
 */

// ============================================================================
// GET — Fetch memorial
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await assertMemorialAccess(params.memorialId, userId, 'read');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        deathDate: true,
        description: true,
        status: true,
        sealed: true,
        createdAt: true,
      },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { memorial } });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[GET /api/memorial/[memorialId]]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch memorial' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH — Update memorial settings
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await assertMemorialAccess(params.memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: { sealed: true, status: true },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    if (memorial.sealed) {
      return NextResponse.json(
        { success: false, error: 'This memorial is sealed and cannot be edited' },
        { status: 403 }
      );
    }

    if (memorial.status === MemorialStatus.ARCHIVED) {
      return NextResponse.json(
        { success: false, error: 'Archived memorials cannot be edited' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { firstName, lastName, birthDate, deathDate, description } = body as {
      firstName?:   string;
      lastName?:    string;
      birthDate?:   string | null;
      deathDate?:   string | null;
      description?: string | null;
    };

    const hasUpdate =
      firstName   !== undefined ||
      lastName    !== undefined ||
      birthDate   !== undefined ||
      deathDate   !== undefined ||
      description !== undefined;

    if (!hasUpdate) {
      return NextResponse.json(
        { success: false, error: 'No fields provided to update' },
        { status: 400 }
      );
    }

    if (firstName !== undefined && firstName.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'First name cannot be empty' },
        { status: 400 }
      );
    }

    if (lastName !== undefined && lastName.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Last name cannot be empty' },
        { status: 400 }
      );
    }

    if (birthDate != null && isNaN(Date.parse(birthDate))) {
      return NextResponse.json(
        { success: false, error: 'Invalid birth date' },
        { status: 400 }
      );
    }

    if (deathDate != null && isNaN(Date.parse(deathDate))) {
      return NextResponse.json(
        { success: false, error: 'Invalid death date' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (firstName   !== undefined) updateData.firstName   = firstName.trim();
    if (lastName    !== undefined) updateData.lastName    = lastName.trim();
    if (birthDate   !== undefined) updateData.birthDate   = birthDate  ? new Date(birthDate)  : null;
    if (deathDate   !== undefined) updateData.deathDate   = deathDate  ? new Date(deathDate)  : null;
    if (description !== undefined) updateData.description = description?.trim() || null;

    // Re-derive title if either name changed
    if (firstName !== undefined || lastName !== undefined) {
      const current = await prisma.memorial.findUnique({
        where: { id: params.memorialId },
        select: { firstName: true, lastName: true },
      });
      const newFirst = (updateData.firstName as string | undefined) ?? current?.firstName ?? '';
      const newLast  = (updateData.lastName  as string | undefined) ?? current?.lastName  ?? '';
      updateData.title = `${newFirst} ${newLast}`.trim();
    }

    const updated = await prisma.memorial.update({
      where: { id: params.memorialId },
      data: updateData,
      select: {
        id: true,
        title: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        deathDate: true,
        description: true,
        sealed: true,
        status: true,
      },
    });

    return NextResponse.json({ success: true, data: { memorial: updated } });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH /api/memorial/[memorialId]]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update memorial' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE — Soft delete (archive) memorial
// ============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await assertMemorialAccess(params.memorialId, userId, 'delete');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: { sealed: true, status: true, title: true },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    if (memorial.sealed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sealed memorials cannot be deleted. This memorial is permanently preserved.',
        },
        { status: 403 }
      );
    }

    // Idempotent — already archived
    if (memorial.status === MemorialStatus.ARCHIVED) {
      return NextResponse.json({
        success: true,
        data: { message: 'Memorial is already archived' },
      });
    }

    await prisma.memorial.update({
      where: { id: params.memorialId },
      data: { status: MemorialStatus.ARCHIVED },
    });

    return NextResponse.json({
      success: true,
      data: { message: `Memorial "${memorial.title}" has been archived` },
    });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[DELETE /api/memorial/[memorialId]]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to archive memorial' },
      { status: 500 }
    );
  }
}
