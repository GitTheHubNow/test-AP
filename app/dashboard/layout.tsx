// app/dashboard/layout.tsx
//
// REPLACEMENT for existing dashboard layout.
// Adds V2 nav items: Cases, Products, Org Settings.
// Home link added pointing to /dashboard (new work tray page).
// All V1 links preserved unchanged.
//
// V2 nav items are always shown — feature flags are checked on the
// destination pages themselves, which show "not enabled" notices.
// Hiding nav items based on flags adds complexity with little benefit
// since clicking them never breaks anything.
//
// CHANGE (Part D — guided onboarding):
// Converted to an async server component so the org-membership guard
// runs server-side before any dashboard content renders (no client-side
// flash of dashboard chrome before a redirect).
//
// A signed-in user with ZERO OrgMember rows is redirected to
// /onboarding instead of being allowed through — previously this case
// didn't exist as a distinct state, because the first org-scoped API
// call (getOrgIdForUser inside /api/dashboard/memorials) would just
// silently auto-create a personal org and the user would never know
// they'd skipped naming their organisation or adding payment.
//
// CRITICAL: this guard uses getOrgContextForUser (lib/auth/getOrgForUser.ts),
// which returns null for no membership and does NOT auto-create anything.
// It deliberately does NOT use getOrgForUser / getOrgIdForUser (lib/tenant.ts)
// — those two auto-create a personal org on first call, which would defeat
// the entire point of this guard by creating the fallback org it's supposed
// to be preventing.
//
// This only guards the dashboard entry point. getOrgForUser's auto-create
// behavior is left completely intact everywhere else in the app (existing
// established users, legacy routes, etc.) — nothing about that fallback is
// being removed globally, only bypassed for this one entry point so new
// users go through onboarding instead.

import { UserButton }        from '@clerk/nextjs';
import { auth }              from '@clerk/nextjs/server';
import { redirect }          from 'next/navigation';
import Link                  from 'next/link';
import { getOrgContextForUser } from '@/lib/auth/getOrgForUser';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  // Middleware already enforces auth for /dashboard(.*), so userId should
  // always be present here — but guard defensively rather than assume.
  if (!userId) {
    redirect('/sign-in');
  }

  const orgContext = await getOrgContextForUser(userId);
  if (!orgContext) {
    redirect('/onboarding');
  }

  return (
    <div className="dash-shell">

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="dash-sidebar">

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-wordmark">Absolute Posterity</div>
          <div className="sidebar-logo-sub">Memorial Platform</div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">

          {/* ── Overview ── */}
          <span className="sidebar-section-label">Overview</span>

          <Link href="/dashboard" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </Link>

          {/* ── Memorials ── */}
          <span className="sidebar-section-label" style={{ marginTop: '0.75rem' }}>Memorials</span>

          <Link href="/dashboard/memorials" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            All Memorials
          </Link>

          <Link href="/dashboard/memorials/new" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            New Memorial
          </Link>

          {/* ── Operations (V2) ── */}
          <span className="sidebar-section-label" style={{ marginTop: '0.75rem' }}>Operations</span>

          <Link href="/dashboard/cases" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            Cases
          </Link>

          <Link href="/dashboard/products" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Products
          </Link>

          {/* ── Organisation ── */}
          <span className="sidebar-section-label" style={{ marginTop: '0.75rem' }}>Organisation</span>

          <Link href="/dashboard/org/settings" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Org Settings
          </Link>

          <Link href="/dashboard/billing" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            Billing
          </Link>

          {/* ── Support ── */}
          <span className="sidebar-section-label" style={{ marginTop: '0.75rem' }}>Support</span>

          <a href="mailto:support@memoriam.com" className="sidebar-nav-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Contact Support
          </a>

        </nav>

        {/* User button */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <UserButton appearance={{ elements: { avatarBox: 'w-8 h-8' } }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--ash)', fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}>
              Account
            </span>
          </div>
        </div>

      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="dash-content">
        {children}
      </div>

    </div>
  );
}
