import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMemorialStats } from '@/lib/stats';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * GET /api/memorial/[memorialId]/stats
 *
 * ⚠️ FILENAME BUG (fixed by this file): the original file at this route
 * folder was named `stats-api-route.ts`, not `route.ts`. Next.js App
 * Router only recognises the exact filename `route.ts` — a differently
 * named file in a route folder is NOT picked up as a route handler at
 * all. This endpoint was very likely returning a 404 in production
 * despite being called by components/DashboardStats.tsx (confirmed —
 * that component does call this exact URL). Delete the old
 * `stats-api-route.ts` file and replace it with this one, named
 * `route.ts`, in the same `app/api/memorial/[memorialId]/stats/` folder.
 *
 * Get statistics for a memorial.
 * Org-scoped read access (previously "Owner-only" via a manual ownerId
 * check that also blocked org staff — fixed to use assertMemorialAccess).
 *
 * Phase 3A - Feature 3
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
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
    await assertMemorialAccess(params.memorialId, userId, 'read');

    // 3. GET STATISTICS
    const stats = await getMemorialStats(params.memorialId);

    // 4. SUCCESS RESPONSE
    return NextResponse.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[GET /api/memorial/[memorialId]/stats]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
