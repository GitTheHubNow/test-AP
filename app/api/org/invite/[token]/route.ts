// app/api/org/invite/[token]/route.ts
//
// GET — public (no auth required). Validates an invite token and
// returns just enough info (org name, invited email, role) for the
// accept-invite page to show "You've been invited to join X" before
// the person has necessarily signed in yet. Does NOT accept the
// invite — see the accept/route.ts sibling for that.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OrgInviteStatus } from '@prisma/client';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  // Enumerable (any guessed/leaked token reveals org name + invited
  // email) — legitimate traffic is one page load, so keep this tight.
  const limited = await checkRateLimit(request, `org-invite-info:${params.token}`, { max: 15, windowMs: 60 * 1000 });
  if (limited) return limited;

  const invite = await prisma.orgInvite.findUnique({
    where:  { token: params.token },
    select: {
      email:     true,
      role:      true,
      status:    true,
      expiresAt: true,
      organisation: { select: { name: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
  }

  const isExpired = invite.expiresAt < new Date();

  if (invite.status !== OrgInviteStatus.PENDING || isExpired) {
    return NextResponse.json(
      {
        success: false,
        error: isExpired ? 'This invite has expired' : `This invite is no longer valid (${invite.status.toLowerCase()})`,
      },
      { status: 410 }, // Gone
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      orgName: invite.organisation.name,
      email:   invite.email,
      role:    invite.role,
    },
  });
}
