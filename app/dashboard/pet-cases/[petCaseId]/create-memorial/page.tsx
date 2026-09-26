// app/dashboard/pet-cases/[petCaseId]/create-memorial/page.tsx
//
// "Create memorial from this pet case" page.
// Same overall flow as app/dashboard/cases/[caseId]/create-memorial/page.tsx
// (prefill → staff reviews/adjusts → submit → auto-link) but deliberately
// NOT built on PrefilledMemorialForm/CasePrefill — that component's
// prefill shape (deceasedName split into firstName/lastName, familyContact,
// venue) is a human-funeral shape, and forcing pet fields through it would
// recreate the exact kind of field-overlap confusion PetCase was designed
// to avoid (see the model comment in schema.prisma). This page posts
// directly to POST /api/memorial with its own honest mapping instead.
//
// Guards:
//   - featurePetAftercare must be true
//   - Pet case must belong to the user's org
//   - If the pet case already has a memorialId, redirect to its detail page

import { redirect, notFound }  from 'next/navigation';
import { auth }                from '@clerk/nextjs/server';
import { prisma }              from '@/lib/prisma';
import { getOrgIdForUser }     from '@/lib/tenant';
import Link                    from 'next/link';
import { CreatePetMemorialForm, type PetCasePrefill } from '@/components/memorial/CreatePetMemorialForm';

interface Props { params: Promise<{ petCaseId: string }> }

export const dynamic = 'force-dynamic';

export default async function CreateMemorialFromPetCasePage({ params }: Props) {
  const { petCaseId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const orgId = await getOrgIdForUser(userId).catch(() => null);
  if (!orgId) redirect('/dashboard');

  const org = await prisma.organisation.findUnique({
    where:  { id: orgId },
    select: { featurePetAftercare: true },
  });
  if (!org?.featurePetAftercare) redirect('/dashboard/pet-cases');

  const petCase = await prisma.petCase.findFirst({
    where: { id: petCaseId, organisationId: orgId },
    select: {
      id: true, caseRef: true, petName: true, species: true, breed: true,
      ownerContactName: true, ownerContactEmail: true, ownerContactPhone: true,
      serviceType: true, stage: true, memorialId: true, status: true,
      readyAt: true, returnedAt: true,
    },
  });

  if (!petCase) notFound();

  if (petCase.memorialId) {
    redirect(`/dashboard/pet-cases/${petCaseId}`);
  }

  if (petCase.status === 'CANCELLED') {
    redirect(`/dashboard/pet-cases/${petCaseId}`);
  }

  // Best-effort surname guess from the owner's name — "Sarah Smith" →
  // "Smith". A single-word name ("Sarah") has no surname to extract, so
  // this falls back to null and the form shows an empty, clearly-editable
  // field rather than guessing something misleading. Staff always see
  // and can change this before submitting either way — this is a
  // starting suggestion, not a silent default.
  const ownerNameParts = petCase.ownerContactName.trim().split(/\s+/);
  const guessedSurname = ownerNameParts.length > 1 ? ownerNameParts[ownerNameParts.length - 1] : null;

  const prefill: PetCasePrefill = {
    petCaseId:         petCase.id,
    petName:           petCase.petName,
    species:           petCase.species,
    breed:             petCase.breed,
    ownerContactName:  petCase.ownerContactName,
    ownerContactEmail: petCase.ownerContactEmail,
    ownerContactPhone: petCase.ownerContactPhone,
    serviceType:       petCase.serviceType,
    suggestedSurname:  guessedSurname,
  };

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard/pet-cases" className="hover:text-gray-700">Pet Cases</Link>
          <span>›</span>
          <Link href={`/dashboard/pet-cases/${petCaseId}`} className="hover:text-gray-700">
            {petCase.petName}
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
              Case <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">{petCase.caseRef}</span>
              {' · '}
              {petCase.petName}
              {petCase.species ? ` (${petCase.species})` : ''}
            </p>

            {petCase.stage !== 'READY' && petCase.stage !== 'RETURNED' && (
              <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200
                              text-blue-800 text-xs font-medium px-3 py-1.5 rounded-full">
                This case hasn't reached "Ready" yet — you can still create the
                memorial now and finish filling it in as the case progresses.
              </div>
            )}

            <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200
                            text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Pre-filled from case — review and adjust as needed
            </div>
          </div>

          <CreatePetMemorialForm prefill={prefill} />
        </div>
      </div>
    </main>
  );
}
