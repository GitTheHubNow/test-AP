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
import { assertMemorialAccess, assertFeatureEnabled } from '@/lib/tenant';
import { handleAuthError } from '@/lib/errors';

type Params = { params: { id: string; requestId: string } };

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    await assertMemorialAccess(params.id, userId);
    await assertFeatureEnabled(userId, 'products');

    // Verify the request belongs to this memorial
    const existing = await prisma.productRequest.findFirst({
      where: { id: params.requestId, memorialId: params.id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    let body: { requestNotes?: string | null };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const updated = await prisma.productRequest.update({
      where: { id: params.requestId },
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
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    await assertMemorialAccess(params.id, userId);
    await assertFeatureEnabled(userId, 'products');

    const existing = await prisma.productRequest.findFirst({
      where: { id: params.requestId, memorialId: params.id },
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

    await prisma.productRequest.delete({ where: { id: params.requestId } });

    return NextResponse.json({ success: true, data: { deleted: true } });

  } catch (err: any) {
    return handleAuthError(err);
  }
}
