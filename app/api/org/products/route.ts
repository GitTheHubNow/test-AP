// app/api/org/products/route.ts
//
// GET /api/org/products?status=REQUESTED&type=plaque
//
// Returns all ProductRequests across the org, filterable by status and/or type.
// Uses denormalised organisationId field to avoid a join.
// Includes memorial display name so the queue can show which memorial each
// request belongs to without a secondary fetch.
//
// Auth: Clerk session. User must belong to an org (getOrgIdForUser).
// Feature flag: featureProducts on the org.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser, assertFeatureEnabled } from '@/lib/tenant';
import { VALID_PRODUCT_TYPES } from '@/lib/products/transitions';
import { handleAuthError } from '@/lib/errors';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

const VALID_STATUSES = ['REQUESTED', 'QUOTED', 'APPROVED', 'FULFILLED', 'CANCELLED'] as const;

export async function GET(req: NextRequest) {
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

    // Query string filters
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const typeParam   = searchParams.get('type');

    const statusFilter =
      statusParam && VALID_STATUSES.includes(statusParam as any)
        ? (statusParam as typeof VALID_STATUSES[number])
        : undefined;

    const typeFilter =
      typeParam && VALID_PRODUCT_TYPES.includes(typeParam as any)
        ? typeParam
        : undefined;

    const requests = await prisma.productRequest.findMany({
      where: {
        organisationId: orgId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter   ? { productType: typeFilter } : {}),
      },
      orderBy: [
        // Active requests first, then by date
        { requestedAt: 'desc' },
      ],
      select: {
        id:              true,
        memorialId:      true,
        productType:     true,
        quantity:        true,
        specifications:  true,
        status:          true,
        quotedPrice:     true,
        requestNotes:    true,
        productionNotes: true,
        requestedAt:     true,
        quotedAt:        true,
        approvedAt:      true,
        completedAt:     true,
        // Include memorial name so queue rows are self-contained
        memorial: {
          select: {
            title:         true,
            firstName:     true,
            lastName:      true,
            preferredName: true,
            nominatedName:  true,
            nominatedEmail: true,
            funeralDate:    true,
            venueName:      true,
            venueAddress:   true,
            funeralCase: {
              select: {
                deceasedName: true, serviceDate: true,
                familyContact: true, contactEmail: true,
                venueName: true, venueAddress: true,
              },
            },
          },
        },
      },
    });

    // Compute display name server-side so client doesn't need to
    const formatted = requests.map(r => {
      const resolved = resolveMemorialFields(r.memorial);
      return {
        ...r,
        memorialName:
          r.memorial.preferredName ||
          [resolved.firstName, resolved.lastName].filter(Boolean).join(' ') ||
          r.memorial.title ||
          'Memorial',
        memorial: undefined, // strip the nested object
      };
    });

    return NextResponse.json({ success: true, data: { requests: formatted } });

  } catch (err: any) {
    return handleAuthError(err);
  }
}
