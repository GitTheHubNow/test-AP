import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { AnalyticsPanel } from '@/components/dashboard/AnalyticsPanel';
import Link from 'next/link';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';

interface AnalyticsPageProps {
  params: Promise<{ memorialId: string }>;
}

/**
 * /dashboard/memorial/[memorialId]/analytics
 *
 * Org-scoped analytics page (previously "Owner-only" via a manual
 * ownerId check that blocked org staff — fixed to use
 * assertMemorialAccess, matching the API route version of this same
 * fix in app/api/memorial/[memorialId]/analytics/route.ts).
 * Phase 9
 */
export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch {
    notFound();
  }

  const memorial = await prisma.memorial.findUnique({
    where:  { id: memorialId },
    select: { title: true, id: true },
  });

  if (!memorial) notFound();

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
              <p className="text-sm text-gray-500 mt-1">{memorial.title}</p>
            </div>
            <Link
              href={`/dashboard/memorial/${memorialId}/settings`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Settings →
            </Link>
          </div>

          <AnalyticsPanel memorialId={memorialId} />

        </div>
      </div>
    </main>
  );
}
