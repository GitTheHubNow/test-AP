import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { decideArchiveAction } from '@/lib/memorial/archiveDecision';

/**
 * PATCH /api/memorial/[memorialId]
 *
 * The real memorial-details update route (used by
 * components/MemorialSettingsForm.tsx and
 * components/memorial/SectionLockedScreen.tsx's unlock-early button).
 *
 * UPDATED (Priority 3, product roadmap — "one source of truth"):
 * firstName/lastName are now REJECTED for a case-linked memorial,
 * server-side, regardless of what the request body contains. The
 * client (MemorialSettingsForm) already omits them from the payload
 * and disables those inputs when case-linked, but that's UI
 * convenience only — a raw API call could previously still write a
 * second, silently-diverging copy of the deceased's name straight
 * into Memorial.firstName/lastName even though the linked
 * FuneralCase.deceasedName is the real source of truth once a case
 * exists. This is the actual enforcement boundary; the UI lock alone
 * was not sufficient.
 *
 * See lib/memorial/resolveMemorialFields.ts for the read-side of this
 * same rule (which value gets DISPLAYED), and MIGRATION NOTE below for
 * why this doesn't reject funeralDate/nominatedName/nominatedEmail/
 * venueName/venueAddress here too, even though those are also
 * case-owned fields once linked.
 *
 * MIGRATION NOTE: This route's existing request body shape only ever
 * accepted firstName/lastName/birthDate/deathDate/description/
 * tributeUnlockOverride — never funeralDate/nominatedName/
 * nominatedEmail/venueName/venueAddress in the first place (those are
 * edited elsewhere, or not directly editable via this route at all
 * today). So the only real drift risk THIS route can introduce is
 * firstName/lastName, which is what's guarded below. If a future
 * change adds those other fields to this route's accepted body, the
 * same case-linked check needs extending to cover them.
 */
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

    const body = await request.json();
    const { firstName, lastName, birthDate, deathDate, description, tributeUnlockOverride } = body as {
      firstName?:   string;
      lastName?:    string;
      birthDate?:   string | null;
      deathDate?:   string | null;
      description?: string | null;
      tributeUnlockOverride?: boolean;
    };

    // Is this memorial case-linked? Only fetch what's needed for the
    // check — funeralCaseId existing (not null) is enough, no need to
    // pull the case's own fields here.
    const existing = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { funeralCase: { select: { id: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
    }
    const isCaseLinked = Boolean(existing.funeralCase);

    if (isCaseLinked && (firstName !== undefined || lastName !== undefined)) {
      return NextResponse.json(
        {
          success: false,
          error: 'This memorial is linked to a case — edit the deceased\u2019s name from the case instead.',
        },
        { status: 409 }, // Conflict — the field has a different source of truth, not a validation failure
      );
    }

    const hasUpdate =
      firstName   !== undefined ||
      lastName    !== undefined ||
      birthDate   !== undefined ||
      deathDate   !== undefined ||
      description !== undefined ||
      tributeUnlockOverride !== undefined;

    if (!hasUpdate) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    // firstName/lastName only reach here if NOT case-linked (blocked above).
    if (firstName   !== undefined) updateData.firstName   = firstName.trim();
    if (lastName    !== undefined) updateData.lastName    = lastName.trim();
    if (birthDate   !== undefined) updateData.birthDate   = birthDate  ? new Date(birthDate)  : null;
    if (deathDate   !== undefined) updateData.deathDate   = deathDate  ? new Date(deathDate)  : null;
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (tributeUnlockOverride !== undefined) updateData.tributeUnlockOverride = tributeUnlockOverride;

    const updated = await prisma.memorial.update({
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
        sealed: true,
        status: true,
        tributeUnlockOverride: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[PATCH /api/memorial/[memorialId]]', error);
    return NextResponse.json({ success: false, error: 'Failed to update memorial' }, { status: 500 });
  }
}

/**
 * DELETE /api/memorial/[memorialId]
 *
 * Called by components/DeleteMemorialButton.tsx. Despite the HTTP verb,
 * this is a soft archive, not a hard delete — sets MemorialStatus.ARCHIVED,
 * which removes the memorial from public access but leaves every
 * Memory/Media/CollectionItem row completely intact and reversible.
 *
 * This route previously had no DELETE handler at all in this copy of the
 * project — the button called this exact URL/method and got a 405,
 * silently doing nothing. Deliberately NOT a real database delete: Memory
 * and Media both carry an ON DELETE RESTRICT constraint back to Memorial
 * (verified against the real applied migration), so Postgres itself would
 * refuse a hard delete on any memorial with content regardless.
 *
 * The actual sealed/already-archived decision lives in the tested
 * lib/memorial/archiveDecision.ts, reused identically by the family
 * self-service "hide memorial" action in
 * app/api/family-access/[memorialId]/visibility/route.ts — same
 * operation, same safety rule, different entry point.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await assertMemorialAccess(memorialId, userId, 'delete');

    const memorial = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { sealed: true, status: true },
    });
    if (!memorial) {
      return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
    }

    const decision = decideArchiveAction(memorial);

    if (decision.action === 'reject') {
      return NextResponse.json({ success: false, error: decision.reason }, { status: decision.status });
    }
    if (decision.action === 'noop') {
      return NextResponse.json({ success: true, data: { id: memorialId, status: 'ARCHIVED' } });
    }

    const updated = await prisma.memorial.update({
      where: { id: memorialId },
      data:  { status: 'ARCHIVED' },
      select: { id: true, status: true },
    });

    return NextResponse.json({ success: true, data: updated });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[DELETE /api/memorial/[memorialId]]', error);
    return NextResponse.json({ success: false, error: 'Failed to archive memorial' }, { status: 500 });
  }
}
