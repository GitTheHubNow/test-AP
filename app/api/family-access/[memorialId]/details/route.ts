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
        const buffer = Buffer.from(await file.arrayBuffer());
        const contentCheck = verifyFileContent(buffer, file.type);
        if (!contentCheck.valid) {
          return NextResponse.json({ success: false, error: contentCheck.reason }, { status: 400 });
        }
        heroImageKey = await saveUploadedFile(file, `memorials/${memorialId}/hero`);
        updateData.heroImageKey = heroImageKey;
      }

      const description = formData.get('description');
      if (typeof description === 'string') updateData.description = description || null;

      const birthDate = formData.get('birthDate');
      if (typeof birthDate === 'string') updateData.birthDate = birthDate ? new Date(birthDate) : null;

      const deathDate = formData.get('deathDate');
      if (typeof deathDate === 'string') updateData.deathDate = deathDate ? new Date(deathDate) : null;

    } else {
      // Text-only update — dates/bio without a new photo.
      const body: { description?: string; birthDate?: string; deathDate?: string } = await request.json();

      if (body.description !== undefined) updateData.description = body.description || null;
      if (body.birthDate !== undefined) updateData.birthDate = body.birthDate ? new Date(body.birthDate) : null;
      if (body.deathDate !== undefined) updateData.deathDate = body.deathDate ? new Date(body.deathDate) : null;
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
