// app/api/family-access/[memorialId]/details/route.ts
//
// Edits the basic details a family member reasonably needs to fix after
// a funeral home hands over — a wrong date, a better hero photo, the
// bio text. Unlike visibility/hide-comment above, this genuinely alters
// content, so it respects `sealed` the same way the funeral home's own
// settings route and the archive route do.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertFamilyAccess, FamilyAccessError } from '@/lib/familyAccess';
import { saveUploadedFile } from '@/lib/storage-server';
import { verifyFileContent } from '@/lib/file-validation';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';

const MAX_DESCRIPTION_LEN = 10_000;
const MAX_HERO_BYTES       = 10 * 1024 * 1024; // 10 MB

/** '' → null (clear the field); a valid date string → Date; anything else → undefined (reject). */
function parseOptionalDate(v: string): Date | null | undefined {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    await assertFamilyAccess(memorialId);

    const memorial = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { sealed: true },
    });
    if (!memorial) {
      return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
    }
    if (memorial.sealed) {
      return NextResponse.json({ success: false, error: 'This memorial is sealed and its details cannot be changed.' }, { status: 409 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    const updateData: Record<string, unknown> = {};
    let heroImageKey: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      // Photo change — same-shape submission as other upload routes.
      const formData = await request.formData();
      const file = formData.get('heroImage');

      if (file instanceof File) {
        if (file.size > MAX_HERO_BYTES) {
          return NextResponse.json({ success: false, error: 'Photo must be 10 MB or smaller' }, { status: 413 });
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const contentCheck = verifyFileContent(buffer, file.type);
        if (!contentCheck.valid) {
          return NextResponse.json({ success: false, error: contentCheck.reason }, { status: 400 });
        }
        heroImageKey = await saveUploadedFile(file, `memorials/${memorialId}/hero`);
        updateData.heroImageKey = heroImageKey;
      }

      const description = formData.get('description');
      if (typeof description === 'string') {
        if (description.length > MAX_DESCRIPTION_LEN) {
          return NextResponse.json({ success: false, error: 'Description is too long' }, { status: 400 });
        }
        updateData.description = description || null;
      }

      const birthDate = formData.get('birthDate');
      if (typeof birthDate === 'string') {
        const d = parseOptionalDate(birthDate);
        if (d === undefined) return NextResponse.json({ success: false, error: 'Invalid birth date' }, { status: 400 });
        updateData.birthDate = d;
      }

      const deathDate = formData.get('deathDate');
      if (typeof deathDate === 'string') {
        const d = parseOptionalDate(deathDate);
        if (d === undefined) return NextResponse.json({ success: false, error: 'Invalid death date' }, { status: 400 });
        updateData.deathDate = d;
      }

    } else {
      // Text-only update — dates/bio without a new photo.
      let body: { description?: string; birthDate?: string; deathDate?: string };
      try { body = await request.json(); }
      catch { return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 }); }

      if (body.description !== undefined) {
        if (typeof body.description !== 'string' || body.description.length > MAX_DESCRIPTION_LEN) {
          return NextResponse.json({ success: false, error: 'Invalid or too-long description' }, { status: 400 });
        }
        updateData.description = body.description || null;
      }
      if (body.birthDate !== undefined) {
        const d = typeof body.birthDate === 'string' ? parseOptionalDate(body.birthDate) : undefined;
        if (d === undefined) return NextResponse.json({ success: false, error: 'Invalid birth date' }, { status: 400 });
        updateData.birthDate = d;
      }
      if (body.deathDate !== undefined) {
        const d = typeof body.deathDate === 'string' ? parseOptionalDate(body.deathDate) : undefined;
        if (d === undefined) return NextResponse.json({ success: false, error: 'Invalid death date' }, { status: 400 });
        updateData.deathDate = d;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const updated = await prisma.memorial.update({
      where: { id: memorialId },
      data:  updateData,
      select: { id: true, heroImageKey: true, birthDate: true, deathDate: true, description: true },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: EntityType.MEMORIAL, entityId: memorialId,
        action:     AuditAction.UPDATE,
        actorId:    `family-session:${memorialId}`,
        actorRole:  ActorRole.FAMILY,
        reasonCode: ReasonCode.FAMILY_SELF_SERVICE,
        metadata:   { fields: Object.keys(updateData) },
      },
    });

    return NextResponse.json({ success: true, data: updated });

  } catch (error) {
    if (error instanceof FamilyAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[PATCH /api/family-access/[memorialId]/details]', error);
    return NextResponse.json({ success: false, error: 'Failed to update details' }, { status: 500 });
  }
}
