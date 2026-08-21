import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CollectionInviteStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { sendEmail } from '@/lib/email';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/collection/invite
 *
 * Generate a family invite link for the collection workspace.
 * Org-scoped edit access (previously a manual ownerId check that
 * blocked org staff — fixed to use assertMemorialAccess).
 * Family members use this link to upload content without a Clerk account.
 *
 * Body:
 *   recipientName  — optional display name
 *   recipientEmail — optional (audit trail only — no email sent here)
 *   expiryDays     — optional, default 7
 *
 * ✅ Phase 11c
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  // title is needed below for the invite email — keep this query, just
  // drop ownerId from the select since assertMemorialAccess now handles
  // the access decision.
  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: { id: true, title: true },
  });

  if (!memorial) {
    return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
  }

  let body: { recipientName?: string; recipientEmail?: string; expiryDays?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — all fields are optional
  }

  const recipientName  = body.recipientName?.trim()  || null;
  const recipientEmail = body.recipientEmail?.trim() || null;
  const expiryDays     = Math.min(Math.max(body.expiryDays ?? 7, 1), 30); // clamp 1–30 days

  // Validate email if provided
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
  }

  const token     = randomUUID();
  const expiresAt = addDays(new Date(), expiryDays);

  try {
    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.collectionInvite.create({
        data: {
          memorialId:    memorialId,
          createdBy:     userId,
          token,
          recipientName,
          recipientEmail,
          status:        CollectionInviteStatus.PENDING,
          expiresAt,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.COLLECTION_INVITE,
          entityId:   created.id,
          action:     AuditAction.CREATE,
          actorId:    userId,
          actorRole:  ActorRole.OWNER,
          reasonCode: ReasonCode.CREATION,
          metadata: {
            memorialId:    memorialId,
            recipientName,
            recipientEmail,
            expiresAt,
          },
        },
      });

      return created;
    });

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/collect/${invite.token}`;

    // Send invite email if recipient email provided
    if (recipientEmail) {
      sendEmail({
        to:      recipientEmail,
        subject: `You've been invited to share photos for ${memorial.title}'s memorial`,
        html: `
          <p>Hi ${recipientName ?? 'there'},</p>
          <p>You've been invited to upload photos and memories for <strong>${memorial.title}</strong>'s memorial.</p>
          <p>
            <a href="${inviteUrl}" style="background:#cdba93;color:#4f5d75;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
              Upload Photos
            </a>
          </p>
          <p>This link expires in ${expiryDays} day${expiryDays !== 1 ? 's' : ''}.</p>
          <p style="color:#666;font-size:0.85em;">If you didn't expect this invitation you can ignore this email.</p>
        `,
        text: `You've been invited to upload photos for ${memorial.title}'s memorial.\n\nUpload here: ${inviteUrl}\n\nThis link expires in ${expiryDays} days.`,
      }).catch(err => console.error('[invite email]', err));
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          invite: {
            id:            invite.id,
            token:         invite.token,
            url:           inviteUrl,
            recipientName: invite.recipientName,
            expiresAt:     invite.expiresAt,
            status:        invite.status,
          },
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('[POST /api/memorial/[id]/collection/invite]', error);
    return NextResponse.json({ success: false, error: 'Failed to create invite' }, { status: 500 });
  }
}

/**
 * GET /api/memorial/[memorialId]/collection/invite
 *
 * List all invites for a memorial (staff only — org-scoped read access,
 * previously a manual ownerId check that blocked org staff).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch (err) {
    return handleAuthError(err);
  }

  // Auto-expire any invites that have passed expiresAt
  await prisma.collectionInvite.updateMany({
    where: {
      memorialId: memorialId,
      status:     CollectionInviteStatus.PENDING,
      expiresAt:  { lt: new Date() },
    },
    data: { status: CollectionInviteStatus.EXPIRED },
  });

  const invites = await prisma.collectionInvite.findMany({
    where:   { memorialId: memorialId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:            true,
      token:         true,
      recipientName: true,
      recipientEmail: true,
      status:        true,
      expiresAt:     true,
      usedAt:        true,
      uploadCount:   true,
      createdAt:     true,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const withUrls = invites.map(inv => ({
    ...inv,
    url: `${appUrl}/collect/${inv.token}`,
  }));

  return NextResponse.json({ success: true, data: { invites: withUrls } });
}
