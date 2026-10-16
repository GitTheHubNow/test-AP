// app/api/handover/accept/[token]/route.ts
//
// FULL REPLACEMENT — combines the original handover logic with the
// post-handover email notifications.
//
// Changes from original:
//   - Added imports for sendHandoverAcceptedToFH, sendHandoverAcceptedToFamily
//   - GET handler unchanged
//   - POST handler: after the transaction succeeds, fires two emails:
//       1. To the funeral home (org.supportEmail) confirming the handover
//       2. To the family (handover.familyContactEmail) confirming ownership
//   - Uses handover.familyContactName directly — no fallback needed,
//     it's already selected in the query.
//   - Emails are awaited (not fire-and-forget) so failures are logged,
//     but a failure to send does NOT roll back the handover or fail the request —
//     the transaction has already committed by this point.

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasMatchingVerifiedEmail, maskEmail } from '@/lib/handoverEmail';
import { prisma } from '@/lib/prisma';
import { HandoverStatus } from '@prisma/client';
import { AuditAction, ActorRole, EntityType, ReasonCode } from '@/lib/audit';
import { ensurePublicToken } from '@/lib/qr';
import { grantFamilyAccess } from '@/lib/familyAccess';
import {
  sendHandoverAcceptedToFH,
  sendHandoverAcceptedToFamily,
} from '@/lib/email/send';

class HandoverAlreadyClaimedError extends Error {}

/**
 * GET /api/handover/accept/[token]
 *
 * Validate an accept token — used by the accept page to check
 * if the link is valid before showing the confirmation UI.
 * No auth required.
 *
 * ✅ Phase 13b — UNCHANGED
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const handover = await prisma.memorialHandover.findUnique({
    where:  { acceptToken: token },
    select: {
      id:                   true,
      status:               true,
      familyContactName:    true,
      familyContactEmail:   true,
      acceptTokenExpiresAt: true,
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

  if (!handover) {
    return NextResponse.json({ success: false, error: 'Invalid accept link', code: 'INVALID' }, { status: 404 });
  }

  if (handover.status === HandoverStatus.COMPLETED) {
    return NextResponse.json({ success: false, error: 'This handover has already been completed', code: 'COMPLETED' }, { status: 409 });
  }

  if (handover.status === HandoverStatus.CANCELLED) {
    return NextResponse.json({ success: false, error: 'This handover has been cancelled', code: 'CANCELLED' }, { status: 409 });
  }

  if (handover.acceptTokenExpiresAt && handover.acceptTokenExpiresAt < new Date()) {
    return NextResponse.json({ success: false, error: 'This accept link has expired', code: 'EXPIRED' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    data: {
      memorial:          handover.memorial,
      familyContactName: handover.familyContactName,
      status:            handover.status,
      // Masked ("j***@gmail.com") so the page can tell the family which
      // address to sign in with, without exposing the full address to anyone
      // who merely holds the link.
      emailHint:         maskEmail(handover.familyContactEmail),
    },
  });
}

/**
 * POST /api/handover/accept/[token]
 *
 * Execute the handover — transfers Memorial.ownerId to the logged-in family member.
 * Family MUST be authenticated with Clerk before calling this.
 *
 * After this:
 * - Memorial.ownerId = family's Clerk userId
 * - Memorial.workflowStage = "HANDED_OVER"
 * - MemorialHandover.status = COMPLETED
 * - Funeral home loses all dashboard access automatically
 * - ADDED: funeral home + family both receive confirmation emails
 *
 * ✅ Phase 13c + Phase 19 (email notifications)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Family MUST be signed in to accept
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'You must be signed in to accept ownership', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const handover = await prisma.memorialHandover.findUnique({
    where:  { acceptToken: token },
    select: {
      id:                   true,
      status:               true,
      memorialId:           true,
      previousOwnerId:      true,
      familyContactName:    true,
      familyContactEmail:   true,
      acceptTokenExpiresAt: true,
      memorial: {
        select: { id: true, ownerId: true, title: true, slug: true, publicToken: true },
      },
    },
  });

  if (!handover) {
    return NextResponse.json({ success: false, error: 'Invalid accept link' }, { status: 404 });
  }

  if (handover.status === HandoverStatus.COMPLETED) {
    return NextResponse.json({ success: false, error: 'Already completed' }, { status: 409 });
  }

  if (handover.status === HandoverStatus.CANCELLED) {
    return NextResponse.json({ success: false, error: 'This handover has been cancelled' }, { status: 409 });
  }

  if (handover.acceptTokenExpiresAt && handover.acceptTokenExpiresAt < new Date()) {
    return NextResponse.json({ success: false, error: 'This accept link has expired' }, { status: 403 });
  }

  // Prevent the original funeral home owner from accepting their own handover
  if (userId === handover.previousOwnerId) {
    return NextResponse.json({ success: false, error: 'The original owner cannot accept the handover' }, { status: 403 });
  }

  // THE LINK ALONE IS NOT ENOUGH. It is a bearer token: before this check,
  // whoever opened a forwarded or intercepted email first — signed in to ANY
  // account — became the owner of a family's memorial. The signed-in account
  // must now own a VERIFIED email address equal to the family contact email
  // the funeral home entered. Fails closed: if Clerk can't be reached we do
  // not guess.
  let accountEmails;
  try {
    const clerk = await clerkClient();
    accountEmails = (await clerk.users.getUser(userId)).emailAddresses;
  } catch (err) {
    console.error('[POST /api/handover/accept] could not load account emails:', err);
    return NextResponse.json(
      { success: false, error: 'We could not verify your email address just now. Please try again in a moment.', code: 'VERIFY_UNAVAILABLE' },
      { status: 503 },
    );
  }
  if (!hasMatchingVerifiedEmail(accountEmails, handover.familyContactEmail)) {
    console.warn(`[handover/accept] email mismatch for handover ${handover.id} (user ${userId})`);
    return NextResponse.json(
      {
        success: false,
        code:    'EMAIL_MISMATCH',
        error:   `This link was sent to ${maskEmail(handover.familyContactEmail)}. Please sign in or sign up with that email address to accept it. If you'd like to use a different address, ask the funeral home to send the link again to it.`,
      },
      { status: 403 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // ATOMIC CLAIM. The status checks above ran outside this transaction, so
      // two simultaneous requests (a double-click, or a forwarded link opened
      // by two people) could both pass them and both transfer ownership — last
      // writer wins. This conditional update succeeds for exactly one caller.
      const claimed = await tx.memorialHandover.updateMany({
        where: { id: handover.id, status: { notIn: [HandoverStatus.COMPLETED, HandoverStatus.CANCELLED] } },
        data:  { status: HandoverStatus.COMPLETED, completedAt: new Date(), familyClerkUserId: userId },
      });
      if (claimed.count === 0) throw new HandoverAlreadyClaimedError();

      // Transfer ownership
      await tx.memorial.update({
        where: { id: handover.memorialId },
        data: {
          ownerId:       userId,
          workflowStage: 'HANDED_OVER',
        },
      });

      // Audit log
      await tx.auditEvent.create({
        data: {
          entityType: EntityType.HANDOVER,
          entityId:   handover.id,
          action:     AuditAction.HANDOVER_COMPLETED,
          actorId:    userId,
          actorRole:  ActorRole.FAMILY,
          reasonCode: ReasonCode.HANDOVER,
          metadata: {
            memorialId:      handover.memorialId,
            previousOwnerId: handover.previousOwnerId,
            newOwnerId:      userId,
            memorialTitle:   handover.memorial.title,
          },
        },
      });
    });

    // ── ADDED: post-handover email notifications ─────────────────────────────
    // Transaction has already committed — these failures are logged but
    // never roll back the handover or fail this request.

    try {
      const funeralHomeOrg = await prisma.organisation.findFirst({
        where:  { members: { some: { userId: handover.previousOwnerId } } },
        select: { supportEmail: true, name: true },
      });

      const familyName  = handover.familyContactName  ?? 'the family';
      const familyEmail = handover.familyContactEmail;

      if (funeralHomeOrg?.supportEmail) {
        await sendHandoverAcceptedToFH({
          funeralHomeEmail:  funeralHomeOrg.supportEmail,
          memorialId:        handover.memorialId,
          memorialTitle:     handover.memorial.title,
          familyContactName: familyName,
          familyEmail:       familyEmail ?? '',
          acceptedAt:        new Date(),
        });
      }

      if (familyEmail) {
        // publicToken is generated lazily elsewhere (see app/api/memorials/
        // [id]/qr/route.ts) — ensurePublicToken generates and persists one
        // if missing, so the family's "you now manage this memorial" email
        // always has a working link.
        const publicToken = await ensurePublicToken(handover.memorialId, handover.memorial.publicToken);

        await sendHandoverAcceptedToFamily({
          familyEmail,
          familyContactName: familyName,
          memorialId:        handover.memorialId,
          memorialTitle:     handover.memorial.title,
          slug:              handover.memorial.slug ?? handover.memorialId,
          publicToken,
        });
      }

      // ADDED — automatically grant family self-service access at the
      // same moment ownership transfers, rather than relying on a
      // manual staff button that may be unreachable once staff access
      // to this memorial ends (see the "Your access to manage it has
      // ended" copy in components/handover/HandoverWorkspace.tsx).
      // See app/api/memorial/[memorialId]/handover/family-access/route.ts
      // for the shared grantFamilyAccess() this calls — same function
      // the manual "resend" button there uses to reissue a lost token.
      const grantResult = await grantFamilyAccess(handover.memorialId, userId, ActorRole.FAMILY);
      if (!grantResult.ok) {
        console.error('[handover/accept] auto family-access grant failed:', grantResult.error);
      }
    } catch (emailErr) {
      // Never fail the handover response because of an email issue
      console.error('[handover/accept] post-handover email failed:', emailErr);
    }
    // ── END ADDED ──────────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      data: {
        memorialId:    handover.memorialId,
        memorialTitle: handover.memorial.title,
        message:       'Ownership transferred successfully. You now manage this memorial.',
      },
    });

  } catch (error) {
    if (error instanceof HandoverAlreadyClaimedError) {
      return NextResponse.json({ success: false, error: 'Already completed' }, { status: 409 });
    }
    console.error('[POST /api/handover/accept/[token]]', error);
    return NextResponse.json({ success: false, error: 'Failed to complete handover' }, { status: 500 });
  }
}
