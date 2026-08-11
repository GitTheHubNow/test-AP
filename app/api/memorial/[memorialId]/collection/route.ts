import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CollectionItemType, CollectionItemStatus, MemoryCategory } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { verifyFileContent } from '@/lib/file-validation';

/**
 * POST /api/memorial/[memorialId]/collection
 *
 * Upload a collection item (staff only — org-scoped edit access,
 * previously a manual ownerId check that blocked org staff, fixed to
 * use assertMemorialAccess).
 * Accepts multipart/form-data with optional file attachment.
 *
 * Fields:
 *   type        — PHOTO | VIDEO | STORY | DOCUMENT (required)
 *   title       — optional
 *   description — optional
 *   category    — optional MemoryCategory
 *   file        — optional file upload (not required for STORY type)
 *
 * ✅ Phase 11b
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(params.memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }

  // Validate type
  const rawType = formData.get('type') as string;
  if (!rawType || !Object.values(CollectionItemType).includes(rawType as CollectionItemType)) {
    return NextResponse.json(
      { success: false, error: `type must be one of: ${Object.values(CollectionItemType).join(', ')}` },
      { status: 400 }
    );
  }
  const type = rawType as CollectionItemType;

  // Optional fields
  const title       = (formData.get('title') as string | null)?.trim() || null;
  const description = (formData.get('description') as string | null)?.trim() || null;
  const rawCategory = formData.get('category') as string | null;
  const category    = rawCategory && Object.values(MemoryCategory).includes(rawCategory as MemoryCategory)
    ? rawCategory as MemoryCategory
    : null;

  // Validate description length
  if (description && description.length > 10000) {
    return NextResponse.json({ success: false, error: 'Description too long (max 10,000 chars)' }, { status: 400 });
  }

  // Handle file upload
  let blobKey:  string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;

  const file = formData.get('file') as File | null;

  if (file && file.size > 0) {
    // Size limit: 50MB for collection (larger than public submissions)
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
      return NextResponse.json({ success: false, error: 'File too large (max 50MB)' }, { status: 400 });
    }

    // MIME type validation per item type
    const ALLOWED: Record<CollectionItemType, string[]> = {
      PHOTO:    ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      VIDEO:    ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
      STORY:    [], // no file for stories
      DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    };

    if (type === 'STORY') {
      return NextResponse.json({ success: false, error: 'STORY type does not accept file uploads' }, { status: 400 });
    }

    if (!ALLOWED[type].includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid file type ${file.type} for item type ${type}` },
        { status: 400 }
      );
    }

    // Save file
    const ext       = extname(file.name) || `.${file.type.split('/')[1]}`;
    const dateDir   = format(new Date(), 'yyyy/MM');
    const filename  = `${randomUUID()}${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', dateDir);

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic-byte check — same fix as the public collect/[token] route.
    // Staff accounts are authenticated and access-checked above, but
    // that only proves who is uploading, not what they're uploading —
    // a compromised or malicious staff account (or a legitimate one
    // fooled into uploading a mislabeled file) could still push a
    // payload with a spoofed Content-Type. Files here land in the same
    // publicly-served public/uploads/** tree as the public route, so
    // the stored-XSS risk from trusting file.type alone is identical
    // regardless of which route the file came in through.
    const contentCheck = verifyFileContent(buffer, file.type);
    if (!contentCheck.valid) {
      return NextResponse.json({ success: false, error: contentCheck.reason }, { status: 400 });
    }

    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    blobKey   = `${dateDir}/${filename}`;
    mimeType  = file.type;
    sizeBytes = file.size;

  } else if (type !== 'STORY') {
    // Non-story items should have a file — warn but don't block (staff may add later)
    console.warn(`[Collection] ${type} item created without a file — memorialId: ${params.memorialId}`);
  }

  // Create collection item + audit log
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.collectionItem.create({
        data: {
          memorialId:  params.memorialId,
          uploadedBy:  userId,
          uploaderRole: 'STAFF',
          type,
          status:      CollectionItemStatus.UNSORTED,
          title,
          description,
          category,
          blobKey,
          mimeType,
          sizeBytes,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.COLLECTION_ITEM,
          entityId:   created.id,
          action:     AuditAction.CREATE,
          actorId:    userId,
          actorRole:  ActorRole.OWNER,
          reasonCode: ReasonCode.CREATION,
          metadata: {
            memorialId: params.memorialId,
            type,
            hasFile: !!blobKey,
            sizeBytes,
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          item: {
            id:          item.id,
            type:        item.type,
            status:      item.status,
            title:       item.title,
            description: item.description,
            category:    item.category,
            blobKey:     item.blobKey,
            mimeType:    item.mimeType,
            sizeBytes:   item.sizeBytes,
            createdAt:   item.createdAt,
          },
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('[POST /api/memorial/[id]/collection]', error);
    return NextResponse.json({ success: false, error: 'Failed to create collection item' }, { status: 500 });
  }
}

/**
 * GET /api/memorial/[memorialId]/collection
 *
 * List all collection items for a memorial (staff only — org-scoped read
 * access, previously a manual ownerId check that blocked org staff).
 * Supports ?status= and ?type= filters.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(params.memorialId, userId, 'read');
  } catch (err) {
    return handleAuthError(err);
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status') as CollectionItemStatus | null;
  const typeFilter   = searchParams.get('type')   as CollectionItemType   | null;

  const items = await prisma.collectionItem.findMany({
    where: {
      memorialId: params.memorialId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(typeFilter   ? { type:   typeFilter   } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: {
      id:          true,
      type:        true,
      status:      true,
      uploaderRole: true,
      title:       true,
      description: true,
      category:    true,
      blobKey:     true,
      mimeType:    true,
      sizeBytes:   true,
      showPublicly: true,
      featured:    true,
      sortOrder:   true,
      reviewedAt:  true,
      rejectionReason: true,
      createdAt:   true,
      invite: {
        select: { recipientName: true },
      },
    },
  });

  return NextResponse.json({ success: true, data: { items } });
}
