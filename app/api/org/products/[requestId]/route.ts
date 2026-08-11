// app/api/org/products/[requestId]/route.ts
//
// PATCH /api/org/products/[requestId]
//
// The fulfilment-side update endpoint. Handles:
//   - Status transitions (with state machine validation)
//   - quotedPrice (required when transitioning to QUOTED)
//   - productionNotes (internal notes, only editable org-side)
//
// Auth: Clerk session. User must belong to the org that owns this request.
// Feature flag: featureProducts.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, assertFeatureEnabled } from '@/lib/tenant';
import {
  isValidTransition,
  applyTransition,
  type ProductRequestStatus,
} from '@/lib/products/transitions';
import { handleAuthError } from '@/lib/errors';

type Params = { params: { requestId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    await assertFeatureEnabled(userId, 'products');

    // Fetch the request and verify it belongs to this org
    const existing = await prisma.productRequest.findFirst({
      where: { id: params.requestId, organisationId: orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    let body: {
      status?:          string;
      quotedPrice?:     number | null;
      productionNotes?: string | null;
    };
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const updateData: Record<string, unknown> = {};

    // ── Status transition ────────────────────────────────────────────────────
    if (body.status !== undefined) {
      const from = existing.status as ProductRequestStatus;
      const to   = body.status as ProductRequestStatus;

      if (!isValidTransition(from, to)) {
        return NextResponse.json(
          { success: false, error: `Invalid transition: ${from} → ${to}` },
          { status: 422 },
        );
      }

      // QUOTED requires a price
      if (to === 'QUOTED' && (body.quotedPrice === undefined || body.quotedPrice === null)) {
        return NextResponse.json(
          { success: false, error: 'quotedPrice is required when transitioning to QUOTED' },
          { status: 400 },
        );
      }

      const transitionData = applyTransition(from, to, {
        quotedPrice: body.quotedPrice ?? undefined,
      });

      Object.assign(updateData, transitionData);
    }

    // ── Production notes (org-side only, no transition required) ────────────
    if (body.productionNotes !== undefined) {
      updateData.productionNotes = body.productionNotes;
    }

    // ── quotedPrice update without status change (e.g. correction) ──────────
    if (body.quotedPrice !== undefined && body.status === undefined) {
      updateData.quotedPrice = body.quotedPrice;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    const updated = await prisma.productRequest.update({
      where: { id: params.requestId },
      data:  updateData,
    });

    return NextResponse.json({ success: true, data: { request: updated } });

  } catch (err: any) {
    return handleAuthError(err);
  }
}
