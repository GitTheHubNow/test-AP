// app/api/org/invite/[token]/accept/route.ts
//
// POST — accept an invite. Requires the caller to be signed in (Clerk).
//
// CRITICAL ORDERING NOTE — read before touching this file:
// This route deliberately does NOT call getOrgIdForUser() or
// getOrgContextForUser() (lib/tenant.ts / lib/auth/getOrgForUser.ts) at
// any point. Both of those auto-create a personal Organisation for any
// user with zero OrgMember rows the first time either is called. If
// this route called either of them before creating the invited
// OrgMember row itself, an invitee with no prior org membership would
// get an unwanted personal org auto-created first — and since
// getOrgContextForUser always resolves to the EARLIEST-created
// membership (`orderBy: createdAt asc`), that auto-created personal org
// would permanently win over the org they were actually invited to, no
// matter what gets added afterwards. This exact failure mode was hit
// and diagnosed during manual testing before this route was built — see
// the session notes on the second test account's org mismatch.
//
// This route works directly with prisma.orgMember — never through
// either org-resolving helper — specifically to guarantee the invited
// membership is the first (and, for a fresh account, only) OrgMember
// row that will ever exist for this user.

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { OrgInviteStatus } from '@prisma/client';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'You must be signed in to accept an invite' }, { status: 401 });
  }

  try {
    return await acceptInvite(token, userId);
  } catch (err) {
    // Every other failure mode in this route returns a clean JSON error
    // (expired, wrong email, already accepted, etc.) — this catches the
    // ones that can't be anticipated (Clerk API blip, transaction
    // failure) so accepting an invite fails gracefully instead of
    // showing the person a raw framework error page mid-onboarding.
    console.error('[org/invite/accept] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'Something went wrong accepting this invite. Please try again.' },
      { status: 500 },
    );
  }
}

async function acceptInvite(token: string, userId: string) {

  const invite = await prisma.orgInvite.findUnique({
    where: { token },
  });

  if (!invite) {
    return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
  }

  const isExpired = invite.expiresAt < new Date();

  if (invite.status !== OrgInviteStatus.PENDING) {
    // Idempotent: if this exact user already accepted this exact invite
    // (e.g. a double-click or page refresh after success), treat it as
    // success rather than an error.
    if (invite.status === OrgInviteStatus.ACCEPTED && invite.acceptedByUserId === userId) {
      return NextResponse.json({ success: true, data: { alreadyAccepted: true } });
    }
    return NextResponse.json(
      { success: false, error: `This invite is no longer valid (${invite.status.toLowerCase()})` },
      { status: 410 },
    );
  }

  if (isExpired) {
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data:  { status: OrgInviteStatus.EXPIRED },
    });
    return NextResponse.json({ success: false, error: 'This invite has expired' }, { status: 410 });
  }

  // Strict email match — the signed-in Clerk account's email must match
  // the address the invite was sent to. Without this, anyone who
  // obtains the token (a forwarded email, a leaked link) could join the
  // org as whatever role the invite grants, regardless of who it was
  // actually meant for.
  const clerkUser = await clerkClient().users.getUser(userId);
  const userEmail = clerkUser.emailAddresses
    ?.find(e => e.id === clerkUser.primaryEmailAddressId)
    ?.emailAddress?.toLowerCase()
    ?? clerkUser.emailAddresses?.[0]?.emailAddress?.toLowerCase();

  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        success: false,
        error: `This invite was sent to ${invite.email}. Please sign in with that email address to accept it.`,
      },
      { status: 403 },
    );
  }

  // Guard against a user who somehow already has a membership in THIS
  // org (e.g. re-clicking an old invite after already being added some
  // other way) — the @@unique([organisationId, userId]) constraint
  // would reject a duplicate insert anyway, but checking first gives a
  // clearer error than a raw Prisma unique-constraint failure.
  const existingMembership = await prisma.orgMember.findUnique({
    where: {
      organisationId_userId: {
        organisationId: invite.organisationId,
        userId,
      },
    },
  });

  if (existingMembership) {
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data:  { status: OrgInviteStatus.ACCEPTED, acceptedAt: new Date(), acceptedByUserId: userId },
    });
    return NextResponse.json({ success: true, data: { alreadyMember: true } });
  }

  // The actual join — direct OrgMember creation, deliberately not via
  // getOrgForUser/getOrgContextForUser (see file header comment).
  await prisma.$transaction([
    prisma.orgMember.create({
      data: {
        organisationId: invite.organisationId,
        userId,
        role: invite.role,
      },
    }),
    prisma.orgInvite.update({
      where: { id: invite.id },
      data:  { status: OrgInviteStatus.ACCEPTED, acceptedAt: new Date(), acceptedByUserId: userId },
    }),
  ]);

  return NextResponse.json({ success: true, data: { joined: true } });
}
