import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';
import { recordApproval } from '@/lib/approvals';

/**
 * POST /api/memorial/[memorialId]/media/[mediaId]/approve
 * 
 * Approve a media attachment.
 * Org-scoped edit access (previously "Owner-only" via a manual ownerId
 * check that blocked org staff — fixed to use assertMemorialAccess).
 *
 * UPDATED: now uses lib/approvals.ts's recordApproval() instead of a
 * hand-rolled prisma.media.update(). This fixes two real gaps found
 * while auditing all 4 approve/reject routes together:
 *   - this route never wrote an AuditEvent — every other approve
 *     action did. Media approvals had no audit trail at all.
 *   - this route never checked memorial.readOnly before allowing an
 *     approval, unlike the Memory and GuestBook routes, which do.
 *     A sealed/read-only memorial's media could still be approved.
 *     Added that check here to match.
 * 
 * ✅ Phase 2A: Photo Upload System
 * ✅ Architecture Compliant:
 * - Auth verification
 * - Org-scoped authorization verification
 * - Consistent response format
 * - Full error handling
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

    // 3. VERIFY MEMORIAL IS NOT READ-ONLY — was missing from this route;
    // Memory and GuestBook's approve routes both already check this.
    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { readOnly: true },
    });
    if (!memorial) {
      return NextResponse.json({ success: false, error: 'Memorial not found' }, { status: 404 });
    }
    if (memorial.readOnly) {
      return NextResponse.json({ success: false, error: 'Memorial is read-only' }, { status: 400 });
    }

    // 4. VERIFY MEDIA EXISTS & BELONGS TO MEMORIAL
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

    // 5. RECORD APPROVAL — updates status + writes AuditEvent together
    await recordApproval({
      entity:     'MEDIA',
      entityId:   mediaId,
      memorialId,
      decision:   'APPROVED',
      reviewedBy: userId,
    });

    // 6. SUCCESS RESPONSE
    return NextResponse.json({ success: true });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[POST /api/memorial/[memorialId]/media/[mediaId]/approve]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to approve media' },
      { status: 500 }
    );
  }
}
