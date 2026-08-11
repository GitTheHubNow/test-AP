// app/dashboard/cases/[caseId]/create-memorial/page.tsx
//
// "Create memorial from this case" page.
// Reads the FuneralCase and passes its data to PrefilledMemorialForm
// so the funeral home doesn't have to re-type anything.
//
// Flow:
//   1. Staff clicks "Create memorial" on case detail page
//   2. This page loads, reads the case, builds prefill data
//   3. PrefilledMemorialForm shows with fields pre-populated
//   4. On submit: memorial created + case auto-linked via PATCH /api/org/cases/[caseId]
//   5. StepConfirm shows "Open memorial dashboard" + "Back to case" buttons
//
// Guards:
//   - featureCaseLite must be true
//   - Case must belong to the user's org
//   - If case already has a memorialId, redirect to case detail (already linked)

import { redirect, notFound }  from 'next/navigation';
import { auth }                from '@clerk/nextjs/server';
import { prisma }              from '@/lib/prisma';
import { getOrgIdForUser }     from '@/lib/tenant';
import Link                    from 'next/link';
import { PrefilledMemorialForm, type CasePrefill } from '@/components/memorial/PrefilledMemorialForm';

interface Props { params: { caseId: string } }

export const dynamic = 'force-dynamic';

export default async function CreateMemorialFromCasePage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featureCaseLite: true },
  });
  if (!org?.featureCaseLite) redirect('/dashboard/cases');

  const funeralCase = await prisma.funeralCase.findFirst({
    where: { id: params.caseId, organisationId: orgId },
    select: {
      id:            true,
      caseRef:       true,
      deceasedName:  true,
      familyContact: true,
      contactEmail:  true,
      contactPhone:  true,
      serviceDate:   true,
      venue:         true,
      memorialId:    true,
      status:        true,
    },
  });

  if (!funeralCase) notFound();

  // Already has a memorial — send them back to the case
  if (funeralCase.memorialId) {
    redirect(`/dashboard/cases/${params.caseId}`);
  }

  // Cancelled cases shouldn't create new memorials
  if (funeralCase.status === 'CANCELLED') {
    redirect(`/dashboard/cases/${params.caseId}`);
  }

  const prefill: CasePrefill = {
    caseId:        funeralCase.id,
    deceasedName:  funeralCase.deceasedName,
    serviceDate:   funeralCase.serviceDate?.toISOString() ?? null,
    venue:         funeralCase.venue,
    familyContact: funeralCase.familyContact,
    contactEmail:  funeralCase.contactEmail,
    contactPhone:  funeralCase.contactPhone,
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard/cases" className="hover:text-gray-700">Cases</Link>
          <span>›</span>
          <Link href={`/dashboard/cases/${params.caseId}`} className="hover:text-gray-700">
            {funeralCase.deceasedName}
          </Link>
          <span>›</span>
          <span className="text-gray-700">Create memorial</span>
        </div>

        <div className="bg-white shadow-sm rounded-lg p-8">

          {/* Header */}
          <div className="mb-6 pb-5 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Create memorial
            </h1>
            <p className="text-sm text-gray-500">
              Case <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">{funeralCase.caseRef}</span>
              {' · '}
              {funeralCase.deceasedName}
            </p>

            {/* Pre-fill summary badge */}
            <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200
                            text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Pre-filled from case — review and adjust as needed
            </div>
          </div>

          <PrefilledMemorialForm prefill={prefill} />
        </div>
      </div>
    </main>
  );
}
