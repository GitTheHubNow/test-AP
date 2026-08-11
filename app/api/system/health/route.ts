import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runSystemHealthCheck } from '@/lib/systemHealth';
import { isPlatformAdmin } from '@/lib/auth/platformAdmin';

/**
 * System health check endpoint.
 * Platform-admin only — reports on infrastructure across the whole
 * platform, not scoped to any one organisation.
 * 
 * GET /api/system/health
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

  const healthReport = await runSystemHealthCheck();

  const statusCode = healthReport.status === 'CRITICAL' ? 503 : 200;

  return NextResponse.json(healthReport, { status: statusCode });
}