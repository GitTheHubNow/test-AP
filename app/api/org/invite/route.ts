// app/api/org/invite/route.ts
//
// POST /api/org/invite — create a new staff invite for the caller's org
// GET  /api/org/invite — list invites for the caller's org
//
// OWNER/ADMIN only — a MEMBER or VIEWER should not be able to invite new
// staff into the org. This is a coarser check than assertMemorialAccess
// (that's per-memorial; this is per-org), so it's done directly here via
// getOrgContextForUser rather than reusing assertMemorialAccess, which
// doesn't apply — there's no memorialId in scope for an org-level invite.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { getOrgContextForUser } from '@/lib/auth/getOrgForUser';
import { sendEmail, getAppUrl } from '@/lib/email';
import { OrgRole } from '@prisma/client';

const INVITE_EXPIRY_DAYS = 7;

// Roles an inviter is allowed to grant. OWNER is deliberately excluded —
// there is exactly one OWNER per org (the auto-assigned creator); adding
// a second via invite would need a distinct "transfer ownership" flow,
// not a regular staff invite.
const INVITABLE_ROLES = [OrgRole.ADMIN, OrgRole.MEMBER, OrgRole.VIEWER] as const;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const ctx = await getOrgContextForUser(userId);
    if (!ctx) {
      return NextResponse.json({ success: false, error: 'No organisation found' }, { status: 403 });
    }

    if (ctx.role !== OrgRole.OWNER && ctx.role !== OrgRole.ADMIN) {
      return NextResponse.json(
        { success: false, error: 'Only owners and admins can invite staff' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { email, role } = body as { email?: string; role?: string };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });
    }

    const normalisedEmail = email.trim().toLowerCase();
    const requestedRole = (role as OrgRole) ?? OrgRole.MEMBER;

    if (!INVITABLE_ROLES.includes(requestedRole as any)) {
      return NextResponse.json(
        { success: false, error: `Role must be one of: ${INVITABLE_ROLES.join(', ')}` },
        { status: 400 },
      );
    }

    // Fetch org name for the email + check for an existing pending invite
    // to the same address, so re-inviting doesn't create duplicate rows.
    const [org, existingPending] = await Promise.all([
      prisma.organisation.findUnique({
        where:  { id: ctx.organisationId },
        select: { name: true },
      }),
      prisma.orgInvite.findFirst({
        where: {
          organisationId: ctx.organisationId,
          email:          normalisedEmail,
          status:         'PENDING',
        },
      }),
    ]);

    if (!org) {
      return NextResponse.json({ success: false, error: 'Organisation not found' }, { status: 404 });
    }

    // Re-inviting the same pending address refreshes the existing invite
    // (new token, new expiry) rather than creating a second row — avoids
    // accumulating duplicate PENDING invites to the same email.
    const token = randomUUID();
    const expiresAt = addDays(new Date(), INVITE_EXPIRY_DAYS);

    const invite = existingPending
      ? await prisma.orgInvite.update({
          where: { id: existingPending.id },
          data:  { token, role: requestedRole, expiresAt },
        })
      : await prisma.orgInvite.create({
          data: {
            organisationId:  ctx.organisationId,
            invitedByUserId: userId,
            email:           normalisedEmail,
            role:            requestedRole,
            token,
            expiresAt,
          },
        });

    const acceptUrl = `${getAppUrl()}/invite/${token}`;

    await sendEmail({
      to:      normalisedEmail,
      subject: `You've been invited to join ${org.name} on Memoriam`,
      html: `
        <p>You've been invited to join <strong>${org.name}</strong> as a team member on Memoriam.</p>
        <p><a href="${acceptUrl}">Accept invitation</a></p>
        <p>This invite expires in ${INVITE_EXPIRY_DAYS} days. If you weren't expecting this, you can ignore this email.</p>
      `,
      text: `You've been invited to join ${org.name} on Memoriam.\n\nAccept here: ${acceptUrl}\n\nThis invite expires in ${INVITE_EXPIRY_DAYS} days.`,
    });

    return NextResponse.json({ success: true, data: { invite } });
  } catch (error) {
    console.error('[POST /api/org/invite]', error);
    return NextResponse.json({ success: false, error: 'Failed to send invite' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const ctx = await getOrgContextForUser(userId);
    if (!ctx) {
      return NextResponse.json({ success: false, error: 'No organisation found' }, { status: 403 });
    }

    if (ctx.role !== OrgRole.OWNER && ctx.role !== OrgRole.ADMIN) {
      return NextResponse.json(
        { success: false, error: 'Only owners and admins can view invites' },
        { status: 403 },
      );
    }

    const invites = await prisma.orgInvite.findMany({
      where:   { organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id:         true,
        email:      true,
        role:       true,
        status:     true,
        expiresAt:  true,
        acceptedAt: true,
        createdAt:  true,
        // token is normally only shown once, right when an invite is
        // first created (it's the sensitive part of the accept link).
        // Included here too so the pending-invites list can offer a
        // "Revoke" action (see components/org/TeamSection.tsx), which
        // needs the token to call PATCH /api/org/invite/[token]/revoke.
        // Safe to include: this whole route is already OWNER/ADMIN-only
        // for THIS org, so anyone who can see this list is already
        // someone who's allowed to revoke any invite in it.
        token: true,
      },
    });

    return NextResponse.json({ success: true, data: { invites } });
  } catch (error) {
    console.error('[GET /api/org/invite]', error);
    return NextResponse.json({ success: false, error: 'Failed to load invites' }, { status: 500 });
  }
}
