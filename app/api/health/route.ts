import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runSystemHealthCheck } from '@/lib/systemHealth';
import { isPlatformAdmin } from '@/lib/auth/platformAdmin';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // The report exposes platform-wide integrity details (audit-trail gaps,
  // trigger status, record counts across ALL organisations). It was
  // previously open to any signed-in user of any funeral home.
  if (!isPlatformAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const healthReport = await runSystemHealthCheck();

  const statusCode = healthReport.status === 'CRITICAL' ? 503 : 200;

  return NextResponse.json(healthReport, { status: statusCode });
}