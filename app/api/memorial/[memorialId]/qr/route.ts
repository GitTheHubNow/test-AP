import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { generateQRCode, ensurePublicToken } from '@/lib/qr';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * GET /api/memorial/[memorialId]/qr
 *
 * Generates a downloadable QR code for a memorial.
 * Org-scoped read access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess, same
 * as app/api/memorials/[id]/qr/route.ts, the sibling plural-named route).
 *
 * NOTE: there are now two QR-related routes for a memorial —
 * /api/memorial/[memorialId]/qr (this file, singular, generates a
 * downloadable image) and /api/memorials/[id]/qr (plural, the lifecycle
 * config API). Both build the same /v/{slug}?key={publicToken} URL via
 * the shared ensurePublicToken() helper (lib/qr.ts) so they can't drift
 * out of sync on token generation, but the naming overlap (singular vs
 * plural "memorial") is confusing and worth consolidating in a follow-up.
 *
 * Phase 3A - Feature 1 (corrected)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await assertMemorialAccess(params.memorialId, userId, 'read');

    const memorial = await prisma.memorial.findUnique({
      where: { id: params.memorialId },
      select: {
        title: true,
        status: true,
        slug: true,
        publicToken: true,
      },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    if (memorial.status === 'ARCHIVED') {
      return NextResponse.json(
        { success: false, error: 'Memorial is archived' },
        { status: 410 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // ensurePublicToken (lib/qr.ts) is the single canonical lazy-token
    // implementation — this route previously had its own inline copy of
    // the same generate-if-missing logic, written before that helper
    // existed.
    const publicToken = await ensurePublicToken(params.memorialId, memorial.publicToken);
    const urlSlug = memorial.slug ?? params.memorialId;
    const publicUrl = `${appUrl}/v/${urlSlug}?key=${publicToken}`;

    const result = await generateQRCode(publicUrl, {
      width: 512,
      errorCorrectionLevel: 'H',
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to generate QR code' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        qrCode: result.dataUrl,
        title: memorial.title,
      },
    });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[GET /api/memorial/[memorialId]/qr]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
