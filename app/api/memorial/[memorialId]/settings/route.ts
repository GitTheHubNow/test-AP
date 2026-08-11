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
 * ⚠️ DEAD ROUTE — not called by anything reachable in the app (re-confirmed
 * during the RBAC sweep — still no callers). The real Settings page
 * (app/dashboard/memorial/[memorialId]/settings/page.tsx) uses
 * components/MemorialSettingsForm.tsx, which calls
 * PATCH /api/memorial/[memorialId] instead (the main memorial route,
 * already fixed in the same sweep). This file's own frontend counterpart —
 * components/MemorialSettings.tsx — is also unimported/unreachable.
 *
 * This file used three field names that don't exist on Memorial
 * (dateOfBirth/dateOfDeath/biography instead of the real
 * birthDate/deathDate/description) and a select missing firstName/
 * lastName needed further down — would have thrown on every real call.
 * Fixed to be correct rather than left as a broken, unreachable
 * duplicate, per the same approach used for the /delete route.
 *
 * Update memorial settings
 * Org-scoped edit access via assertMemorialAccess (previously a manual
 * ownerId check — fixed as part of the same sweep, for consistency, even
 * though nothing currently calls this route).
 *
 * Phase 3A - Feature 4
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
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
    await assertMemorialAccess(params.memorialId, userId, 'edit');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      // firstName/lastName needed below when only one of the two is being
      // updated — the title needs to be rebuilt from both, even the one
      // that isn't changing.
      select: { firstName: true, lastName: true },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
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
