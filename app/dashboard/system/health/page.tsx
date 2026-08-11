import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { SystemHealthDashboard } from '@/components/SystemHealthDashboard';
import { PerformanceDashboard } from '@/components/PerformanceDashboard';
import { TrialSettingsPanel } from '@/components/system/TrialSettingsPanel';
import { isPlatformAdmin } from '@/lib/auth/platformAdmin';

export default async function SystemHealthPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Page-level guard in addition to the API-level check in
  // /api/system/health and /api/system/performance — a non-admin
  // shouldn't see this page shell at all, not just get a 403 on fetch.
  if (!isPlatformAdmin(userId)) {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            System Health Monitor
          </h1>
          <SystemHealthDashboard />
        </div>

        <div>
          <PerformanceDashboard />
        </div>

        {/* Trial-length / promo control — platform-admin only, see
            app/api/system/trial-settings/route.ts. Added when the
            sign-up-to-payment onboarding flow was built. */}
        <div>
          <TrialSettingsPanel />
        </div>
      </div>
    </main>
  );
}