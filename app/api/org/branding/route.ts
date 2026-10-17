// app/api/org/branding/route.ts
//
// GET  /api/org/branding  — returns current org branding fields
// PATCH /api/org/branding — updates org branding fields
//
// Auth: Clerk session. User must belong to an org.
// Feature flag: isWhiteLabelEnabled is an operator flag (set in Prisma Studio).
//   - GET always works regardless of flag — UI needs current values to show.
//   - PATCH always works — org can configure branding before going live.
//   - The flag controls whether resolveTheme() *applies* the branding on public pages.
//
// Validation: uses validateBrandingUpdate() already written in lib/theme/index.ts.
// No new validation logic here.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';
import { validateBrandingUpdate }     from '@/lib/theme';

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    const org = await prisma.organisation.findUnique({
      where:  { id: orgId },
      select: {
        name:                true,
        brandName:           true,
        logoUrl:             true,
        primaryColor:        true,
        secondaryColor:      true,
        supportEmail:        true,
        poweredByEnabled:    true,
        isWhiteLabelEnabled: true,
      },
    });

    if (!org) {
      return NextResponse.json({ success: false, error: 'Organisation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { branding: org } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/branding/GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    // validateBrandingUpdate throws an Error with .status = 400 on bad input.
    // It returns only the fields that were present and valid.
    let updateData: ReturnType<typeof validateBrandingUpdate>;
    try {
      updateData = validateBrandingUpdate(body);
    } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
      return NextResponse.json(
        { success: false, error: err.message ?? 'Validation error' },
        { status: err.status ?? 400 },
      );
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    const updated = await prisma.organisation.update({
      where:  { id: orgId },
      data:   updateData,
      select: {
        name:                true,
        brandName:           true,
        logoUrl:             true,
        primaryColor:        true,
        secondaryColor:      true,
        supportEmail:        true,
        poweredByEnabled:    true,
        isWhiteLabelEnabled: true,
      },
    });

    return NextResponse.json({ success: true, data: { branding: updated } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    console.error('[org/branding/PATCH]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
