// app/api/memorials/[id]/products/[requestId]/route.ts
//
// PATCH  /api/memorials/[id]/products/[requestId]
//   — Update notes on a request (requestNotes only — production notes are org-side).
//   — Or delete via DELETE below.
//
// DELETE /api/memorials/[id]/products/[requestId]
//   — Only allowed when status = REQUESTED (can't delete in-progress requests).
//
// Auth: Clerk session + assertMemorialAccess.
// Feature flag: featureProducts.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
// Role-aware access check that THROWS on failure. Was importing
// assertMemorialAccess from '@/lib/tenant', which instead RETURNS null on
// failure — and both handlers below called it as a bare `await
// assertMemorialAccess(id, userId);` with the result never checked. That
// made it a complete no-op: any authenticated user (from any org, as long
// as their own org had the 'products' feature flag) could edit or delete
// product requests belonging to any other org's memorials, not merely a
// VIEWER-role gap. This version throws (caught by the existing try/catch
// below) instead of returning a value that can be silently ignored.
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { assertFeatureEnabled } from '@/lib/tenant';
import { handleAuthError } from '@/lib/errors';

type Params = { params: Promise<{ id: string; requestId: string }> };

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, requestId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    await assertMemorialAccess(id, userId, 'edit');
    await assertFeatureEnabled(userId, 'products');

    // Verify the request belongs to this memorial
    const existing = await prisma.productRequest.findFirst({
      where: { id: requestId, memorialId: id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    let body: { requestNotes?: string | null };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const updated = await prisma.productRequest.update({
      where: { id: requestId },
      data: {
        ...(body.requestNotes !== undefined ? { requestNotes: body.requestNotes } : {}),
      },
    });

    return NextResponse.json({ success: true, data: { request: updated } });

  } catch (err: any) {
    return handleAuthError(err);
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, requestId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    await assertMemorialAccess(id, userId, 'delete');
    await assertFeatureEnabled(userId, 'products');

    const existing = await prisma.productRequest.findFirst({
      where: { id: requestId, memorialId: id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Only allow deletion when still in REQUESTED state —
    // once quoted or further, the request is in the fulfilment pipeline.
    if (existing.status !== 'REQUESTED') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a request that is already in progress. Cancel it instead.' },
        { status: 409 },
      );
    }

    await prisma.productRequest.delete({ where: { id: requestId } });

    return NextResponse.json({ success: true, data: { deleted: true } });

  } catch (err: any) {
    return handleAuthError(err);
  }
}
