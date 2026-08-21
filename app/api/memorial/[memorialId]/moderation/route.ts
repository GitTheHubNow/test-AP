import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * GET /api/memorial/[memorialId]/moderation
 * 
 * Returns pending memories with attached media for moderation.
 * Org-scoped endpoint (previously "Owner-only" via a manual ownerId
 * check that blocked every org staff member except the literal creator
 * — fixed to use assertMemorialAccess, matching the rest of the API).
 * 
 * ✅ Phase 1 Compliant (preserved)
 * ✅ Phase 2A Enhanced (added media support)
 * ✅ Architecture Compliant:
 * - Consistent response format: { success, data }
 * - Full try/catch coverage
 * - Auth verification
 * - Org-scoped authorization verification
 * - Safe error messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    // 1. AUTHENTICATION
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. AUTHORIZATION - org-scoped access check
    await assertMemorialAccess(memorialId, userId, 'read');

    const memorial = await prisma.memorial.findUnique({
      where: { id: memorialId },
      select: {
        id: true,
        title: true,
      },
    });

    if (!memorial) {
      return NextResponse.json(
        { success: false, error: 'Memorial not found' },
        { status: 404 }
      );
    }

    // 3. FETCH PENDING MEMORIES + MEDIA
    const memories = await prisma.memory.findMany({
      where: { 
        memorialId: memorialId,
        status: MemoryStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        authorName: true,
        message: true,
        createdAt: true,
        status: true,
        // ✅ Phase 2A: Include attached media
        media: {
          select: {
            id: true,
            blobKey: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // 4. CONSISTENT SUCCESS RESPONSE
    return NextResponse.json({
      success: true,
      data: {
        memorial: {
          id: memorial.id,
          title: memorial.title,
        },
        memories,
      },
    });

  } catch (error) {
    // 5. SAFE ERROR HANDLING
    // assertMemorialAccess throws with a .status (401/403/404) — surface
    // that correctly instead of masking it as a generic 500.
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[GET /api/memorial/[memorialId]/moderation]', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
