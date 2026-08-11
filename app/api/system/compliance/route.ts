import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateComplianceReport } from '@/lib/compliance';
import { isPlatformAdmin } from '@/lib/auth/platformAdmin';

/**
 * Generate compliance report.
 * Platform-admin only — this report is platform-wide, not scoped to a
 * single organisation, so no funeral home user (regardless of their
 * OWNER/ADMIN org role) should be able to call this.
 * 
 * GET /api/system/compliance?start=ISO_DATE&end=ISO_DATE
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

  const url = new URL(request.url);
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: 'Start and end dates required' },
      { status: 400 }
    );
  }

  try {
    const startDate = new Date(startParam);
    const endDate = new Date(endParam);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const report = await generateComplianceReport(startDate, endDate);

    return NextResponse.json(report);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}