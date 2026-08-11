import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPerformanceMetrics } from '@/lib/performance';
import { isPlatformAdmin } from '@/lib/auth/platformAdmin';

/**
 * System performance metrics endpoint.
 * Platform-admin only — reports on infrastructure across the whole
 * platform, not scoped to any one organisation.
 *
 * NOTE: this route previously called runSystemHealthCheck() (copy-pasted
 * from /api/system/health) instead of getPerformanceMetrics(), so
 * PerformanceDashboard.tsx was rendering health-check data under a
 * performance-metrics label. Fixed as part of the pre-launch audit.
 *
 * GET /api/system/performance
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!isPlatformAdmin(userId)) {
    return NextResponse.json(
      { error: 'Forbidden — platform admin access required' },
      { status: 403 }
    );
  }

  const metrics = await getPerformanceMetrics();

  return NextResponse.json(metrics);
}
