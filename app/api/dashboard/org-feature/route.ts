// app/api/dashboard/org-features/route.ts
//
// GET — returns the case-type feature flags for the current user's org
// (featureCaseLite, featurePetAftercare). Used by the main dashboard
// page (app/dashboard/page.tsx) to decide whether to show the human
// "Memorials" view, a "Pet Cases" prompt, or both — that page is a
// client component with no existing org-context fetch, and this is
// intentionally the smallest possible addition rather than converting
// the whole page to a server component or building a bigger org-info
// endpoint it doesn't otherwise need.

import { NextResponse }         from 'next/server';
import { auth }                 from '@clerk/nextjs/server';
import { getOrgContextForUser } from '@/lib/auth/getOrgForUser';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
  }

  const ctx = await getOrgContextForUser(userId);
  if (!ctx) {
    // No org membership yet (e.g. mid-onboarding) — treat as neither
    // case type enabled rather than erroring, so the dashboard can
    // still render something reasonable.
    return NextResponse.json({
      success: true,
      data: { featureCaseLite: false, featurePetAftercare: false },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      featureCaseLite:     ctx.featureCaseLite,
      featurePetAftercare: ctx.featurePetAftercare,
    },
  });
}
