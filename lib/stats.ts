/**
 * Memorial statistics calculations
 * 
 * Phase 3A - Feature 3: Dashboard Stats
 */

import { prisma } from '@/lib/prisma';
import { MemoryStatus, MediaStatus } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface MemorialStats {
  totalMemories: number;
  pendingMemories: number;
  approvedMemories: number;
  rejectedMemories: number;
  totalPhotos: number;
  pendingPhotos: number;
  approvedPhotos: number;
  recentSubmissions: number; // Last 7 days
}

export interface GlobalStats {
  totalMemorials: number;
  activeMemorials: number;
  totalMemories: number;
  totalPhotos: number;
}

// ============================================================================
// MEMORIAL STATISTICS
// ============================================================================

/**
 * Get statistics for a specific memorial
 * 
 * @param memorialId - Memorial ID
 * @returns Memorial statistics
 */
export async function getMemorialStats(memorialId: string): Promise<MemorialStats> {
  try {
    // Get memory counts by status
    const memoryCounts = await prisma.memory.groupBy({
      by: ['status'],
      where: { memorialId },
      _count: true,
    });

    // Get photo counts by status
    const photoCounts = await prisma.media.groupBy({
      by: ['status'],
      where: { memorialId },
      _count: true,
    });

    // Get recent submissions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentCount = await prisma.memory.count({
      where: {
        memorialId,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
    });

    // Calculate totals
    const stats: MemorialStats = {
      totalMemories: 0,
      pendingMemories: 0,
      approvedMemories: 0,
      rejectedMemories: 0,
      totalPhotos: 0,
      pendingPhotos: 0,
      approvedPhotos: 0,
      recentSubmissions: recentCount,
    };

    // Aggregate memory counts
    memoryCounts.forEach((group) => {
      stats.totalMemories += group._count;
      if (group.status === MemoryStatus.PENDING) {
        stats.pendingMemories = group._count;
      } else if (group.status === MemoryStatus.APPROVED) {
        stats.approvedMemories = group._count;
      } else if (group.status === MemoryStatus.REJECTED) {
        stats.rejectedMemories = group._count;
      }
    });

    // Aggregate photo counts
    photoCounts.forEach((group) => {
      stats.totalPhotos += group._count;
      if (group.status === MediaStatus.PENDING) {
        stats.pendingPhotos = group._count;
      } else if (group.status === MediaStatus.APPROVED) {
        stats.approvedPhotos = group._count;
      }
    });

    return stats;

  } catch (error) {
    console.error('[Stats] Failed to get memorial stats:', error);
    throw new Error('Failed to calculate statistics');
  }
}

/**
 * Get global statistics for a user
 * 
 * @param userId - User ID (Clerk)
 * @returns Global statistics across all memorials
 */
export async function getUserStats(userId: string): Promise<GlobalStats> {
  try {
    // Count memorials
    const [totalMemorials, activeMemorials] = await Promise.all([
      prisma.memorial.count({
        where: { ownerId: userId },
      }),
      prisma.memorial.count({
        where: {
          ownerId: userId,
          status: 'ACTIVE',
        },
      }),
    ]);

    // Get memorial IDs
    const memorials = await prisma.memorial.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });

    const memorialIds = memorials.map((m) => m.id);

    // Count memories and photos across all memorials
    const [totalMemories, totalPhotos] = await Promise.all([
      prisma.memory.count({
        where: {
          memorialId: { in: memorialIds },
        },
      }),
      prisma.media.count({
        where: {
          memorialId: { in: memorialIds },
        },
      }),
    ]);

    return {
      totalMemorials,
      activeMemorials,
      totalMemories,
      totalPhotos,
    };

  } catch (error) {
    console.error('[Stats] Failed to get user stats:', error);
    throw new Error('Failed to calculate user statistics');
  }
}

/**
 * Get memory submission trend (last 30 days)
 * 
 * @param memorialId - Memorial ID
 * @returns Array of { date, count } for last 30 days
 */
export async function getSubmissionTrend(memorialId: string) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const memories = await prisma.memory.findMany({
      where: {
        memorialId,
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by date
    const dateCounts = new Map<string, number>();
    
    memories.forEach((memory) => {
      const dateKey = memory.createdAt.toISOString().split('T')[0];
      dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
    });

    // Convert to array
    return Array.from(dateCounts.entries()).map(([date, count]) => ({
      date,
      count,
    }));

  } catch (error) {
    console.error('[Stats] Failed to get submission trend:', error);
    return [];
  }
}
