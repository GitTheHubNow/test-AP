import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runSystemHealthCheck } from '@/lib/systemHealth';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const healthReport = await runSystemHealthCheck();

  const statusCode = healthReport.status === 'CRITICAL' ? 503 : 200;

  return NextResponse.json(healthReport, { status: statusCode });
}