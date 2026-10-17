import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { CollectionItemStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import { BULK_LIMITS, titleFromFileName } from '@/lib/bulk-upload';
import { directUploadsEnabled, verifyDirectUploads } from '@/lib/direct-upload';

/**
 * POST /api/memorial/[memorialId]/collection/bulk/complete
 *
 * Step 2 of a staff upload: the browser has PUT the files into the bucket;
 * this verifies what actually landed (lib/direct-upload.ts) and records the
 * survivors as UNSORTED CollectionItems with an audit event each. Safe to
 * retry. Optional per-item `title` / `description` (used by the single-file
 * form); otherwise the title defaults to the file name.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> },
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  const limited = await checkRateLimit(request, `bulk-complete:${userId}`, { max: 120, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  if (!directUploadsEnabled()) {
    return NextResponse.json({ success: false, error: 'Direct upload is only used in production' }, { status: 400 });
  }

  let body: { items?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
  const raw = body?.items;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > BULK_LIMITS.maxFilesPerBatch) {
    return NextResponse.json({ success: false, error: 'Invalid items' }, { status: 400 });
  }

  // Optional metadata, keyed by the upload key we issued.
  const meta = new Map<string, { title?: string; description?: string }>();
  for (const r of raw as any[]) {
    if (typeof r?.key !== 'string') continue;
    meta.set(r.key, {
      title:       typeof r.title === 'string' ? r.title.trim().slice(0, 200) || undefined : undefined,
      description: typeof r.description === 'string' ? r.description.trim().slice(0, 10000) || undefined : undefined,
    });
  }

  const { saveable, failed, alreadyRecorded } = await verifyDirectUploads({ memorialId, raw });

  let items: Array<Record<string, unknown>> = [];
  if (saveable.length > 0) {
    try {
      items = await prisma.$transaction(async (tx) => {
        const created = [];
        for (const v of saveable) {
          const m = meta.get(v.key);
          created.push(await tx.collectionItem.create({
            data: {
              memorialId, uploadedBy: userId, uploaderRole: 'STAFF',
              type: v.type, status: CollectionItemStatus.UNSORTED,
              title: m?.title ?? titleFromFileName(v.name),
              description: m?.description ?? null,
              blobKey: v.key, mimeType: v.mimeType, sizeBytes: v.size,
            },
          }));
        }
        await tx.auditEvent.createMany({
          data: created.map((c) => ({
            entityType: EntityType.COLLECTION_ITEM, entityId: c.id,
            action: AuditAction.CREATE, actorId: userId, actorRole: ActorRole.OWNER,
            reasonCode: ReasonCode.CREATION,
            metadata: { memorialId, type: c.type, hasFile: true, sizeBytes: c.sizeBytes, direct: true },
          })),
        });
        return created.map((c) => ({
          id: c.id, type: c.type, status: c.status, uploaderRole: c.uploaderRole,
          title: c.title, description: c.description, category: c.category,
          blobKey: c.blobKey, mimeType: c.mimeType, sizeBytes: c.sizeBytes,
          showPublicly: c.showPublicly, featured: c.featured, rejectionReason: c.rejectionReason,
          createdAt: c.createdAt.toISOString(), invite: null,
        }));
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (error) {
      console.error('[POST bulk/complete] save failed', error);
      const { deleteFile } = await import('@/lib/storage-server');
      await Promise.all(saveable.map((v) => deleteFile(v.key).catch(() => {})));
      return NextResponse.json({ success: false, error: 'Failed to save uploaded files' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, data: { items, failed, alreadyRecorded: alreadyRecorded.size } });
}
