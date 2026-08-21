import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MediaStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/media/[mediaId]/reject
 * 
 * Reject a media attachment.
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 * 
 * ✅ Phase 2A: Photo Upload System
 * ✅ Architecture Compliant:
 * - Auth verification
 * - Org-scoped authorization verification
 * - Consistent response format
 * - Full error handling
 * - Audit trail (rejectedAt)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string; mediaId: string }> }
) {
  const { memorialId, mediaId } = await params;

  try {
    // 1. AUTHENTICATION
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. VERIFY ORG-SCOPED ACCESS
    await assertMemorialAccess(memorialId, userId, 'edit');

    // 3. VERIFY MEDIA EXISTS & BELONGS TO MEMORIAL
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: { 
        memorialId: true,
        status: true,
      },
    });

    if (!media) {
      return NextResponse.json(
        { success: false, error: 'Media not found' },
        { status: 404 }
      );
    }

    if (media.memorialId !== memorialId) {
      return NextResponse.json(
        { success: false, error: 'Media not found' },
        { status: 404 }
      );
    }

    // 4. UPDATE STATUS TO REJECTED
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: MediaStatus.REJECTED,
        rejectedAt: new Date(), // Audit trail
      },
    });

    // 5. SUCCESS RESPONSE
    return NextResponse.json({ success: true });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[POST /api/memorial/[memorialId]/media/[mediaId]/reject]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reject media' },
      { status: 500 }
    );
  }
}
