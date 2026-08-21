// app/api/org/invite/[token]/revoke/route.ts
//
// PATCH — revoke a pending org staff invite. Mirrors
// app/api/memorial/[memorialId]/collection/invite/[inviteId]/revoke/route.ts's
// shape, but org-scoped (OWNER/ADMIN only) rather than memorial-scoped.
//
// FIXED: originally at app/api/org/invite/[inviteId]/revoke/route.ts —
// Next.js requires every dynamic segment at the same path depth to use
// the same parameter name, and app/api/org/invite/[token]/route.ts (the
// public invite-info lookup) already claims [token] as the sibling
// segment name under /api/org/invite/. Having [inviteId] alongside
// [token] at that same depth is a hard build error ("You cannot use
// different slug names for the same dynamic path"), not just a style
// inconsistency. Moved to [token] and changed the lookup to match —
// this is arguably more natural anyway, since the dashboard UI has the
// invite's token on hand (it's what's shown/copied for the invite link),
// not necessarily its raw database id.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { OrgInviteStatus, OrgRole } from '@prisma/client';
import { getOrgContextForUser } from '@/lib/auth/getOrgForUser';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const ctx = await getOrgContextForUser(userId);
    if (!ctx) {
      return NextResponse.json({ success: false, error: 'No organisation found' }, { status: 403 });
    }

    if (ctx.role !== OrgRole.OWNER && ctx.role !== OrgRole.ADMIN) {
      return NextResponse.json(
        { success: false, error: 'Only owners and admins can revoke invites' },
        { status: 403 },
      );
    }

    const invite = await prisma.orgInvite.findUnique({
      where:  { token: token },
      select: { id: true, organisationId: true, status: true },
    });

    if (!invite || invite.organisationId !== ctx.organisationId) {
      return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
    }

    if (invite.status !== OrgInviteStatus.PENDING) {
      return NextResponse.json(
        { success: false, error: `Cannot revoke invite with status: ${invite.status}` },
        { status: 409 },
      );
    }

    await prisma.orgInvite.update({
      where: { id: invite.id },
      data:  { status: OrgInviteStatus.REVOKED },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[org/invite/revoke] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Failed to revoke invite' }, { status: 500 });
  }
}
