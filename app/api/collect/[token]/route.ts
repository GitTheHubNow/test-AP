import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CollectionItemType, CollectionItemStatus, CollectionInviteStatus, MemoryCategory } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import { verifyFileContent } from '@/lib/file-validation';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * POST /api/collect/[token]
 *
 * Public endpoint — family member uploads a collection item via invite link.
 * No Clerk auth required. Token is the authentication mechanism.
 *
 * Accepts multipart/form-data — same fields as staff upload route.
 *
 * ✅ Phase 11c
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Bucketed per-invite-token: a legitimate family gathering uploading
  // from behind one shared NAT/IP (common — a wake, a funeral home's
  // guest wifi) shouldn't be throttled by another unrelated invite's
  // traffic sharing that IP, but a single invite link being hammered by
  // a script still gets capped.
  const limited = await checkRateLimit(request, `collect-upload:${params.token}`, { max: 20, windowMs: 60 * 1000 });
  if (limited) return limited;

  // Validate invite token
  const invite = await prisma.collectionInvite.findUnique({
    where:  { token: params.token },
    select: { id: true, memorialId: true, status: true, expiresAt: true, uploadCount: true },
  });

  if (!invite) {
    return NextResponse.json({ success: false, error: 'Invalid invite link' }, { status: 404 });
  }

  // Check expiry
  if (invite.status === CollectionInviteStatus.REVOKED) {
    return NextResponse.json({ success: false, error: 'This invite link has been revoked' }, { status: 403 });
  }

  if (invite.status === CollectionInviteStatus.EXPIRED || invite.expiresAt < new Date()) {
    // Mark expired if not already
    if (invite.status !== CollectionInviteStatus.EXPIRED) {
      await prisma.collectionInvite.update({
        where: { id: invite.id },
        data:  { status: CollectionInviteStatus.EXPIRED },
      });
    }
    return NextResponse.json({ success: false, error: 'This invite link has expired' }, { status: 403 });
  }

  // Per-invite upload limit — prevent abuse
  const MAX_UPLOADS_PER_INVITE = 20;
  if (invite.uploadCount >= MAX_UPLOADS_PER_INVITE) {
    return NextResponse.json(
      { success: false, error: 'Upload limit reached for this invite link' },
      { status: 429 }
    );
  }

  // Parse form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }

  const rawType = formData.get('type') as string;
  if (!rawType || !Object.values(CollectionItemType).includes(rawType as CollectionItemType)) {
    return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  }
  const type = rawType as CollectionItemType;

  const title       = (formData.get('title') as string | null)?.trim()       || null;
  const description = (formData.get('description') as string | null)?.trim() || null;
  const rawCategory = formData.get('category') as string | null;
  const category    = rawCategory && Object.values(MemoryCategory).includes(rawCategory as MemoryCategory)
    ? rawCategory as MemoryCategory
    : null;

  if (description && description.length > 10000) {
    return NextResponse.json({ success: false, error: 'Description too long' }, { status: 400 });
  }

  // Handle file
  let blobKey:  string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;

  const file = formData.get('file') as File | null;

  if (file && file.size > 0) {
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
      return NextResponse.json({ success: false, error: 'File too large (max 50MB)' }, { status: 400 });
    }

    const ALLOWED: Record<CollectionItemType, string[]> = {
      PHOTO:    ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      VIDEO:    ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
      STORY:    [],
      DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    };

    if (type === 'STORY') {
      return NextResponse.json({ success: false, error: 'STORY type does not accept file uploads' }, { status: 400 });
    }

    if (!ALLOWED[type].includes(file.type)) {
      return NextResponse.json({ success: false, error: `Invalid file type for ${type}` }, { status: 400 });
    }

    // Extension allowlist — defense in depth. extname() only extracts an
    // extension (it can't itself introduce a path-traversal segment since
    // we generate the actual on-disk filename with randomUUID(), not from
    // user input), but rejecting unexpected extensions up front is a
    // cheap extra layer against malformed/unusual filenames.
    const ALLOWED_EXTS = [
      '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
      '.mp4', '.mov', '.avi', '.webm',
      '.pdf', '.doc', '.docx',
    ];
    const declaredExt = extname(file.name).toLowerCase();
    if (declaredExt && !ALLOWED_EXTS.includes(declaredExt)) {
      return NextResponse.json({ success: false, error: 'Invalid file extension' }, { status: 400 });
    }

    const ext       = declaredExt || `.${file.type.split('/')[1]}`;
    const dateDir   = format(new Date(), 'yyyy/MM');
    const filename  = `${randomUUID()}${ext}`;
    const uploadDir = join(process.cwd(), 'public', 'uploads', dateDir);

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic-byte check — verify the file's actual content matches its
    // declared type, rather than trusting the client-supplied
    // Content-Type header alone. See lib/file-validation.ts for why this
    // matters: uploads are written into public/uploads/** and served
    // directly by Next.js, so a mislabeled file is a stored XSS risk
    // against anyone who opens the link, not just a data-integrity issue.
    const contentCheck = verifyFileContent(buffer, file.type);
    if (!contentCheck.valid) {
      return NextResponse.json({ success: false, error: contentCheck.reason }, { status: 400 });
    }

    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    blobKey   = `${dateDir}/${filename}`;
    mimeType  = file.type;
    sizeBytes = file.size;
  }

  // Must have either a file or a description for STORY
  if (type === 'STORY' && !description && !title) {
    return NextResponse.json(
      { success: false, error: 'A story must have at least a title or description' },
      { status: 400 }
    );
  }

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.collectionItem.create({
        data: {
          memorialId:   invite.memorialId,
          uploadedBy:   `invite:${invite.id}`, // pseudo-userId for family
          uploaderRole: 'FAMILY',
          inviteId:     invite.id,
          type,
          status:       CollectionItemStatus.UNSORTED,
          title,
          description,
          category,
          blobKey,
          mimeType,
          sizeBytes,
        },
      });

      // Mark invite as accepted on first use, increment count
      await tx.collectionInvite.update({
        where: { id: invite.id },
        data: {
          status:      invite.status === CollectionInviteStatus.PENDING
            ? CollectionInviteStatus.ACCEPTED
            : undefined,
          usedAt:      invite.status === CollectionInviteStatus.PENDING ? new Date() : undefined,
          uploadCount: { increment: 1 },
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.COLLECTION_ITEM,
          entityId:   created.id,
          action:     AuditAction.CREATE,
          actorId:    `invite:${invite.id}`,
          actorRole:  ActorRole.PUBLIC,
          reasonCode: ReasonCode.CREATION,
          metadata: {
            memorialId: invite.memorialId,
            inviteId:   invite.id,
            type,
            hasFile:    !!blobKey,
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
            id:        item.id,
            type:      item.type,
            status:    item.status,
            title:     item.title,
            createdAt: item.createdAt,
          },
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('[POST /api/collect/[token]]', error);
    return NextResponse.json({ success: false, error: 'Failed to upload' }, { status: 500 });
  }
}

/**
 * GET /api/collect/[token]
 *
 * Validate an invite token — used by the /collect/[token] page to check
 * if the link is valid before showing the upload form.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const invite = await prisma.collectionInvite.findUnique({
    where:  { token: params.token },
    select: {
      id:            true,
      status:        true,
      expiresAt:     true,
      recipientName: true,
      memorial: {
        select: {
          id:        true,
          title:     true,
          firstName: true,
          lastName:  true,
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ success: false, error: 'Invalid invite link' }, { status: 404 });
  }

  const expired = invite.status === CollectionInviteStatus.EXPIRED || invite.expiresAt < new Date();
  const revoked = invite.status === CollectionInviteStatus.REVOKED;

  if (expired || revoked) {
    return NextResponse.json({
      success: false,
      error:   expired ? 'This invite link has expired' : 'This invite link has been revoked',
      code:    expired ? 'EXPIRED' : 'REVOKED',
    }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    data: {
      memorial:      invite.memorial,
      recipientName: invite.recipientName,
      expiresAt:     invite.expiresAt,
    },
  });
}
