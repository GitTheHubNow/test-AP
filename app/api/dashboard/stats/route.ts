import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus, MediaStatus } from '@prisma/client';

/**
 * GET /api/dashboard/stats
 *
 * Returns aggregate counts for the authenticated user's dashboard.
 * All queries run in a single $transaction for consistency + efficiency.
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     totalMemorials: number,
 *     approvedMemories: number,
 *     pendingMemories: number,
 *     totalMedia: number,
 *   }
 * }
 *
 * Phase 3A - Feature 2
 */
export async function GET() {
  try {
    // 1. AUTH
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get all memorial IDs owned by this user in one fast lookup
    //    We need the IDs to scope the Memory + Media counts correctly.
    const userMemorials = await prisma.memorial.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    const memorialIds = userMemorials.map((m) => m.id);
    const totalMemorials = memorialIds.length;

    // 3. If no memorials yet, skip the aggregate queries entirely
    if (totalMemorials === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalMemorials: 0,
          approvedMemories: 0,
          pendingMemories: 0,
          totalMedia: 0,
        },
      });
    }

    // 4. Run remaining counts in parallel — all scoped to this user's memorials
    const [approvedMemories, pendingMemories, totalMedia] = await prisma.$transaction([
      // Approved memories across all user's memorials
      prisma.memory.count({
        where: {
          memorialId: { in: memorialIds },
          status: MemoryStatus.APPROVED,
        },
      }),

      // Pending memories awaiting moderation
      prisma.memory.count({
        where: {
          memorialId: { in: memorialIds },
          status: MemoryStatus.PENDING,
        },
      }),

      // All media uploads (any status) across all user's memorials
      prisma.media.count({
        where: {
          memorialId: { in: memorialIds },
        },
      }),
    ]);

    // 5. RESPONSE
    return NextResponse.json({
      success: true,
      data: {
        totalMemorials,
        approvedMemories,
        pendingMemories,
        totalMedia,
      },
    });

  } catch (error) {
    console.error('[GET /api/dashboard/stats]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load stats' },
      { status: 500 }
    );
  }
}
