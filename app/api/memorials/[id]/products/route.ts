// app/api/memorials/[id]/products/route.ts
//
// GET  /api/memorials/[id]/products  — list all product requests for a memorial
// POST /api/memorials/[id]/products  — create a new product request
//
// Auth: Clerk session + assertMemorialAccess (org-aware ownership).
// Feature flag: featureProducts must be true on the org.
// V2 auth pattern — mirrors /api/memorials/[id]/qr and /api/memorials/[id]/slideshow.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { Prisma }                     from '@prisma/client';
import { assertFeatureEnabled, getOrgIdForUser, orgErrorResponse } from '@/lib/tenant';
// Role-aware access check. Was importing assertMemorialAccess from
// '@/lib/tenant' (org-membership only, no role check) — a VIEWER-role org
// member could create/list product requests for any memorial in the org.
// This checker enforces VIEWER=read-only / MEMBER=own-memorials-only /
// ADMIN+OWNER=full access, and throws (rather than returning null) on
// failure, matching the existing try/catch + handleAuthError below.
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { VALID_PRODUCT_TYPES } from '@/lib/products/transitions';
import { handleAuthError } from '@/lib/errors';
import { sendEmailAsync, getAppUrl } from '@/lib/email';
import { ensurePublicToken } from '@/lib/qr';
import { renderProductOrderEmail } from '@/lib/email-templates/product-order-email';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    await assertMemorialAccess(id, userId, 'read');

    await assertFeatureEnabled(userId, 'products');

    const requests = await prisma.productRequest.findMany({
      where:   { memorialId: id },
      orderBy: { requestedAt: 'desc' },
      select: {
        id:              true,
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
      },
    });

    return NextResponse.json({ success: true, data: { requests } });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    return handleAuthError(err);
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    await assertMemorialAccess(id, userId, 'edit');

    await assertFeatureEnabled(userId, 'products');

    let body: {
      productType?:    string;
      quantity?:       number;
      specifications?: Record<string, unknown>;
      requestNotes?:   string;
    };

    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    // Validate productType
    if (!body.productType || !VALID_PRODUCT_TYPES.includes(body.productType as any)) {
      return NextResponse.json(
        { success: false, error: `productType must be one of: ${VALID_PRODUCT_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const quantity = typeof body.quantity === 'number' && body.quantity > 0
      ? Math.floor(body.quantity)
      : 1;

    // Resolve organisationId for denormalised field
    const orgId = await getOrgIdForUser(userId).catch(() => null);

    const request = await prisma.productRequest.create({
      data: {
        memorialId:     id,
        organisationId: orgId ?? undefined,
        productType:    body.productType,
        quantity,
        // Prisma's generated JSON input type (NullableJsonNullValueInput |
        // InputJsonValue) doesn't structurally match a plain
        // Record<string, unknown> even though the runtime value is fine —
        // this is a known Prisma JSON-field typing quirk, not a real type
        // mismatch. Cast through Prisma.InputJsonValue rather than `any`
        // so we still get some type checking on the JSON shape.
        specifications: (body.specifications as Prisma.InputJsonValue) ?? undefined,
        requestNotes:   body.requestNotes   ?? undefined,
        status:         'REQUESTED',
      },
    });

    // Notify the fulfillment/production address so the item actually gets
    // made — see lib/email-templates/product-order-email.tsx. This does
    // NOT go to the family; staff create requests on the family's behalf.
    // Fire-and-forget: an email failure (or missing env var) should never
    // block staff from successfully logging the order.
    const orderEmail = process.env.PRODUCT_ORDER_EMAIL;
    if (orderEmail) {
      const [memorial, funeralCase, org] = await Promise.all([
        prisma.memorial.findUnique({
          where:  { id: id },
          select: {
            firstName: true, lastName: true, preferredName: true, title: true,
            funeralDate: true, slug: true, publicToken: true,
            // PRIORITY 3 FIX: this builds the name/date that goes into a
            // real fulfilment/production order email — e.g. an engraved
            // plaque — so a stale value here isn't just a display bug,
            // it's the wrong name or date going to whoever is physically
            // making the item. Resolve via the linked case below.
            nominatedName:  true,
            nominatedEmail: true,
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
        }),
        prisma.funeralCase.findUnique({
          where:  { memorialId: id },
          select: { caseRef: true },
        }),
        orgId
          ? prisma.organisation.findUnique({ where: { id: orgId }, select: { name: true } })
          : Promise.resolve(null),
      ]);

      const resolved = memorial ? resolveMemorialFields(memorial) : null;

      const deceasedName =
        memorial?.preferredName ||
        [resolved?.firstName, resolved?.lastName].filter(Boolean).join(' ') ||
        memorial?.title ||
        'Unknown';

      const html = renderProductOrderEmail({
        caseRef:          funeralCase?.caseRef ?? null,
        deceasedName,
        organisationName: org?.name ?? 'Funeral home',
        productType:      body.productType,
        quantity,
        specifications:   (body.specifications as Record<string, unknown>) ?? null,
        requestNotes:     body.requestNotes ?? null,
        serviceDate:      resolved?.funeralDate
          ? resolved.funeralDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
          : null,
        // FIXED: previously built the retired /m/{id} URL, copied from the
        // now-fixed QR generation page (app/dashboard/memorial/
        // [memorialId]/qr/page.tsx). This is the exact address that gets
        // engraved/printed, so it must be the real, current public URL —
        // /v/{slug}?key={publicToken} — not the retired scheme.
        // ensurePublicToken generates one if this memorial's QR panel has
        // never been opened, so a product order never goes out with a
        // ?key=null/undefined URL.
        publicUrl:  memorial
          ? `${getAppUrl()}/v/${memorial.slug ?? id}?key=${await ensurePublicToken(id, memorial.publicToken)}`
          : `${getAppUrl()}/dashboard/memorial/${id}/qr`,
        requestUrl: `${getAppUrl()}/dashboard/memorial/${id}/products`,
      });

      sendEmailAsync({
        to:      orderEmail,
        subject: `New order: ${quantity}× ${body.productType} — ${deceasedName}`,
        html,
      });
    } else {
      console.error('[products/POST] PRODUCT_ORDER_EMAIL not set — order notification not sent');
    }

    return NextResponse.json({ success: true, data: { request } }, { status: 201 });

  } catch (err: any) {
    { const _orgErr = orgErrorResponse(err); if (_orgErr) return _orgErr; }
    return handleAuthError(err);
  }
}
