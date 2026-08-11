import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { MemoryStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * GET /api/memorial/[memorialId]/analytics
 *
 * Org-scoped (any staff member with read access on this memorial's org,
 * or the direct owner for legacy pre-org memorials). Previously said
 * "Owner-only" and enforced that with a manual ownerId check, which
 * blocked every staff member except the literal creator — fixed to use
 * assertMemorialAccess, matching the rest of the memorial API. Returns:
 * - Total page views
 * - Unique visitors (distinct visitorTokens)
 * - Views by day (last 30 days)
 * - Views by referrer source
 * - Top memories by total reactions
 *
 * Phase 9
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await assertMemorialAccess(params.memorialId, userId, 'read');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel
    const [
      totalViews,
      uniqueVisitors,
      allViews,
      referrerBreakdown,
      topMemories,
    ] = await Promise.all([
      // Total views all time
      prisma.pageView.count({
        where: { memorialId: params.memorialId },
      }),

      // Unique visitors all time
      prisma.pageView.groupBy({
        by:    ['visitorToken'],
        where: { memorialId: params.memorialId },
      }),

      // All views in last 30 days (for day-by-day chart)
      prisma.pageView.findMany({
        where:   { memorialId: params.memorialId, createdAt: { gte: thirtyDaysAgo } },
        select:  { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),

      // Views by referrer
      prisma.pageView.groupBy({
        by:    ['referrer'],
        where: { memorialId: params.memorialId },
        _count: { referrer: true },
        orderBy: { _count: { referrer: 'desc' } },
      }),

      // Top memories by reaction count
      prisma.memory.findMany({
        where: {
          memorialId: params.memorialId,
          status:     MemoryStatus.APPROVED,
        },
        select: {
          id:         true,
          authorName: true,
          message:    true,
          featured:   true,
          reactions:  { select: { emoji: true } },
        },
      }),
    ]);

    // Build views-by-day map for last 30 days
    const viewsByDay: Record<string, number> = {};
    // Initialise all 30 days to 0
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      viewsByDay[key] = 0;
    }
    for (const view of allViews) {
      const key = view.createdAt.toISOString().slice(0, 10);
      if (key in viewsByDay) viewsByDay[key]++;
    }

    // Shape referrer breakdown
    const referrers = referrerBreakdown.map(r => ({
      source: r.referrer ?? 'direct',
      count:  r._count.referrer,
    }));

    // Shape top memories — aggregate reactions, sort by total
    const memoriesWithCounts = topMemories
      .map(m => {
        const totalReactions = m.reactions.length;
        const emojiCounts: Record<string, number> = {};
        for (const r of m.reactions) {
          emojiCounts[r.emoji] = (emojiCounts[r.emoji] ?? 0) + 1;
        }
        return {
          id:             m.id,
          authorName:     m.authorName,
          excerpt:        m.message.slice(0, 120) + (m.message.length > 120 ? '…' : ''),
          featured:       m.featured,
          totalReactions,
          emojiCounts,
        };
      })
      .sort((a, b) => b.totalReactions - a.totalReactions)
      .slice(0, 5); // top 5

    return NextResponse.json({
      success: true,
      data: {
        totalViews,
        uniqueVisitors:  uniqueVisitors.length,
        viewsByDay,
        referrers,
        topMemories:     memoriesWithCounts,
      },
    });

  } catch (error) {
    // assertMemorialAccess throws with a .status (401/403/404) — surface
    // that correctly instead of masking it as a generic 500.
    if (error && typeof error === 'object' && 'status' in error) {
      return handleAuthError(error);
    }
    console.error('[GET /api/memorial/[memorialId]/analytics]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
