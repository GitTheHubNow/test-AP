import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { HandoverStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { sendHandoverInitiated } from '@/lib/email/send';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/handover
 *
 * Create or update a handover configuration.
 * Org-scoped edit access (previously a manual ownerId check that blocked
 * org staff — fixed to use assertMemorialAccess).
 * Generates an accept token and marks the handover as SCHEDULED or PENDING.
 *
 * Body:
 *   familyContactName  — required
 *   familyContactEmail — required
 *   familyContactPhone — optional
 *   scheduledAt        — optional ISO date string (null = manual trigger)
 *
 * ✅ Phase 13a
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

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: { id: true, title: true, workflowStage: true },
  });

  if (!memorial) {
    return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
  }

  if (memorial.workflowStage === 'HANDED_OVER') {
    return NextResponse.json({ success: false, error: 'Memorial has already been handed over' }, { status: 409 });
  }

  let body: {
    familyContactName:  string;
    familyContactEmail: string;
    familyContactPhone?: string;
    scheduledAt?:       string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate required fields
  if (!body.familyContactName?.trim()) {
    return NextResponse.json({ success: false, error: 'familyContactName is required' }, { status: 400 });
  }
  if (!body.familyContactEmail?.trim()) {
    return NextResponse.json({ success: false, error: 'familyContactEmail is required' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.familyContactEmail.trim())) {
    return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid scheduledAt date' }, { status: 400 });
  }
  if (scheduledAt && scheduledAt < new Date()) {
    return NextResponse.json({ success: false, error: 'scheduledAt must be in the future' }, { status: 400 });
  }

  const acceptToken           = randomUUID();
  const acceptTokenExpiresAt  = addDays(new Date(), 30);
  const status                = scheduledAt ? HandoverStatus.SCHEDULED : HandoverStatus.PENDING;

  try {
    // Upsert — one handover per memorial
    const existing = await prisma.memorialHandover.findUnique({
      where:  { memorialId: memorialId },
      select: { id: true, status: true },
    });

    if (existing && existing.status === HandoverStatus.COMPLETED) {
      return NextResponse.json({ success: false, error: 'Handover already completed' }, { status: 409 });
    }

    const handover = await prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.memorialHandover.update({
            where: { memorialId: memorialId },
            data: {
              initiatedBy:          userId,
              status,
              familyContactName:    body.familyContactName.trim(),
              familyContactEmail:   body.familyContactEmail.trim(),
              familyContactPhone:   body.familyContactPhone?.trim() ?? null,
              scheduledAt,
              acceptToken,
              acceptTokenExpiresAt,
              previousOwnerId:      userId,
              // Reset completion fields if re-configuring
              completedAt:          null,
              cancelledAt:          null,
              cancelReason:         null,
              notificationSentAt:   null,
            },
          })
        : await tx.memorialHandover.create({
            data: {
              memorialId:           memorialId,
              initiatedBy:          userId,
              status,
              familyContactName:    body.familyContactName.trim(),
              familyContactEmail:   body.familyContactEmail.trim(),
              familyContactPhone:   body.familyContactPhone?.trim() ?? null,
              scheduledAt,
              acceptToken,
              acceptTokenExpiresAt,
              previousOwnerId:      userId,
            },
          });

      await tx.auditEvent.create({
        data: {
          entityType: EntityType.HANDOVER,
          entityId:   record.id,
          action:     AuditAction.HANDOVER_INITIATED,
          actorId:    userId,
          actorRole:  ActorRole.OWNER,
          reasonCode: ReasonCode.HANDOVER,
          metadata: {
            memorialId:         memorialId,
            familyContactEmail: body.familyContactEmail.trim(),
            scheduledAt:        scheduledAt?.toISOString() ?? null,
            status,
          },
        },
      });

      return record;
    });

    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/handover/accept/${acceptToken}`;

    // Send handover invitation email via policy engine
    try {
      const org = await prisma.organisation.findFirst({
        where:  { members: { some: { userId } } },
        select: { name: true },
      });

      await sendHandoverInitiated({
        familyEmail:       body.familyContactEmail.trim(),
        familyContactName: body.familyContactName?.trim() ?? 'there',
        memorialId:        memorialId,
        memorialTitle:     memorial.title,
        funeralHomeName:   org?.name ?? 'the funeral home',
        acceptToken,
        expiresAt:         acceptTokenExpiresAt,
      });
    } catch (emailErr) {
      console.error('[handover email]', emailErr);
    }
    return NextResponse.json({
      success: true,
      data: {
        handover: {
          id:                   handover.id,
          status:               handover.status,
          familyContactName:    handover.familyContactName,
          familyContactEmail:   handover.familyContactEmail,
          scheduledAt:          handover.scheduledAt?.toISOString() ?? null,
          acceptUrl,
          acceptTokenExpiresAt: handover.acceptTokenExpiresAt?.toISOString() ?? null,
        },
      },
    }, { status: existing ? 200 : 201 });

  } catch (error) {
    console.error('[POST /api/memorial/[id]/handover]', error);
    return NextResponse.json({ success: false, error: 'Failed to configure handover' }, { status: 500 });
  }
}

/**
 * GET /api/memorial/[memorialId]/handover
 *
 * Get current handover config for a memorial (staff only — org-scoped
 * read access, previously a manual ownerId check that blocked org staff).
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

  const handover = await prisma.memorialHandover.findUnique({
    where:  { memorialId: memorialId },
    select: {
      id:                   true,
      status:               true,
      familyContactName:    true,
      familyContactEmail:   true,
      familyContactPhone:   true,
      scheduledAt:          true,
      completedAt:          true,
      cancelledAt:          true,
      cancelReason:         true,
      acceptToken:          true,
      acceptTokenExpiresAt: true,
      notificationSentAt:   true,
      previousOwnerId:      true,
      createdAt:            true,
      updatedAt:            true,
    },
  });

  if (!handover) {
    return NextResponse.json({ success: true, data: { handover: null } });
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const acceptUrl = handover.acceptToken ? `${appUrl}/handover/accept/${handover.acceptToken}` : null;

  return NextResponse.json({
    success: true,
    data: {
      handover: {
        ...handover,
        acceptUrl,
        scheduledAt:          handover.scheduledAt?.toISOString()          ?? null,
        completedAt:          handover.completedAt?.toISOString()          ?? null,
        cancelledAt:          handover.cancelledAt?.toISOString()          ?? null,
        acceptTokenExpiresAt: handover.acceptTokenExpiresAt?.toISOString() ?? null,
        notificationSentAt:   handover.notificationSentAt?.toISOString()   ?? null,
        createdAt:            handover.createdAt.toISOString(),
        updatedAt:            handover.updatedAt.toISOString(),
      },
    },
  });
}

/**
 * DELETE /api/memorial/[memorialId]/handover
 *
 * Cancel a pending or scheduled handover.
 * Org-scoped edit access (previously a manual ownerId check that blocked
 * org staff — fixed to use assertMemorialAccess).
 */
export async function DELETE(
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

  const handover = await prisma.memorialHandover.findUnique({
    where:  { memorialId },
    select: { id: true, status: true },
  });

  if (!handover) {
    return NextResponse.json({ success: false, error: 'No handover configured' }, { status: 404 });
  }

  if (handover.status === HandoverStatus.COMPLETED) {
    return NextResponse.json({ success: false, error: 'Cannot cancel a completed handover' }, { status: 409 });
  }

  let body: { cancelReason?: string } = {};
  try { body = await request.json(); } catch { /* optional */ }

  await prisma.$transaction(async (tx) => {
    await tx.memorialHandover.update({
      where: { id: handover.id },
      data: {
        status:      HandoverStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: body.cancelReason?.trim() ?? null,
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: EntityType.HANDOVER,
        entityId:   handover.id,
        action:     AuditAction.HANDOVER_CANCELLED,
        actorId:    userId,
        actorRole:  ActorRole.OWNER,
        reasonCode: ReasonCode.HANDOVER,
        metadata:   { memorialId, cancelReason: body.cancelReason ?? null },
      },
    });
  });

  return NextResponse.json({ success: true });
}
