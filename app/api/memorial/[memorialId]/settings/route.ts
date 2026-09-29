import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

interface UpdateSettingsRequest {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  description?: string;
  readOnly?: boolean;
}

/**
 * PATCH /api/memorial/[memorialId]/settings
 *
 * NOTE: despite the comment that used to be here, this route is NOT dead —
 * components/memorial/CreatePetMemorialForm.tsx calls it right after
 * creating a pet memorial, to set `description` (which POST /api/memorial
 * doesn't accept at creation time). Whoever wrote the "dead route" comment
 * checked MemorialSettingsForm.tsx and MemorialSettings.tsx (both of which
 * really are unreachable/superseded by PATCH /api/memorial/[memorialId])
 * but missed this caller.
 *
 * This file previously used three field names that don't exist on Memorial
 * (dateOfBirth/dateOfDeath/biography instead of the real
 * birthDate/deathDate/description) and a select missing firstName/lastName
 * needed further down — already fixed to the field names used below.
 *
 * Also previously missing the sealed/archived immutability check that
 * PATCH /api/memorial/[memorialId] has — added below, same reasoning: a
 * sealed memorial should not be editable via any route, not just the one
 * the settings-page UI happens to use.
 *
 * Update memorial settings
 * Org-scoped edit access via assertMemorialAccess.
 *
 * Phase 3A - Feature 4
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    // 1. AUTHENTICATION
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. VERIFY ORG-SCOPED ACCESS
    await assertMemorialAccess(memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      // firstName/lastName needed below when only one of the two is being
      // updated — the title needs to be rebuilt from both, even the one
      // that isn't changing. sealed/status needed for the immutability
      // check below.
      select: { firstName: true, lastName: true, sealed: true, status: true },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    // Sealed/archived memorials are immutable — see the identical check
    // (and longer explanation) in PATCH /api/memorial/[memorialId].
    if (memorial.sealed || memorial.status === 'ARCHIVED') {
      return NextResponse.json(
        {
          success: false,
          error: memorial.sealed
            ? 'This memorial is sealed and its details can no longer be edited.'
            : 'This memorial is archived and can no longer be edited.',
        },
        { status: 409 },
      );
    }

    // 3. PARSE REQUEST
    const body: UpdateSettingsRequest = await request.json();

    // 4. VALIDATE INPUT
    if (body.firstName && body.firstName.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'First name cannot be empty' },
        { status: 400 }
      );
    }

    if (body.lastName && body.lastName.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Last name cannot be empty' },
        { status: 400 }
      );
    }

    // 5. PREPARE UPDATE DATA
    const updateData: any = {};

    if (body.firstName !== undefined) {
      updateData.firstName = body.firstName.trim();
    }

    if (body.lastName !== undefined) {
      updateData.lastName = body.lastName.trim();
    }

    // Update title if name changed
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const firstName = body.firstName !== undefined 
        ? body.firstName.trim()
        : memorial.firstName;
      const lastName = body.lastName !== undefined
        ? body.lastName.trim()
        : memorial.lastName;
      updateData.title = `${firstName} ${lastName}`;
    }

    if (body.birthDate !== undefined) {
      updateData.birthDate = body.birthDate
        ? new Date(body.birthDate)
        : null;
    }

    if (body.deathDate !== undefined) {
      updateData.deathDate = body.deathDate
        ? new Date(body.deathDate)
        : null;
    }

    if (body.description !== undefined) {
      updateData.description = body.description.trim() || null;
    }

    if (body.readOnly !== undefined) {
      updateData.readOnly = body.readOnly;
    }

    // 6. UPDATE MEMORIAL
    const updatedMemorial = await prisma.memorial.update({
      where: { id: memorialId },
      data: updateData,
      select: {
        id: true,
        title: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        deathDate: true,
        description: true,
        readOnly: true,
      },
    });

    // 7. SUCCESS RESPONSE
    return NextResponse.json({
      success: true,
      data: { memorial: updatedMemorial },
    });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH /api/memorial/[memorialId]/settings]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
