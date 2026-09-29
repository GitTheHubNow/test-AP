/**
 * proxy.ts
 *
 * Route protection via Clerk.
 *
 * RENAMED from middleware.ts (Next.js 16 — the "middleware" file
 * convention is deprecated in favour of "proxy", same location
 * (project root, next to app/), same behaviour. Only the filename and
 * the exported function name changed: middleware() -> proxy(). The
 * Clerk API calls — UPDATED for @clerk/nextjs v7 (Core 3): auth().protect()
 * is now `await auth.protect()` (no parens on auth itself; auth is used
 * directly rather than called then destructured). This is a real,
 * documented Core 3 breaking change, not a stylistic edit — see
 * https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3
 *
 * Note for later: Next.js 16 also moved this file's default runtime
 * from Edge to Node.js, and several sources recommend moving auth
 * logic further down the stack (layouts/route handlers) rather than
 * relying on this file as the only security layer — this app already
 * does that correctly (every protected API route also calls auth()
 * internally; see the V1-comment below), so no change needed there.
 *
 * CHANGE from V1:
 *   Added '/api/memorials(.*)' to isProtectedRoute.
 *   The original only protected '/api/memorial(.*)' (singular).
 *   V2 routes are at /api/memorials/[id]/qr, /api/memorials/[id]/products etc (plural).
 *   Without this addition those routes would not be intercepted by Clerk middleware.
 *   The route handlers still call auth() internally, so they return 401 for
 *   unauthenticated requests regardless — but middleware protection is the
 *   correct first layer of defence.
 *
 * CHANGE (org invite system):
 *   GET /api/org/invite/[token] (info lookup — org name, invited email,
 *   role — used to render the "you've been invited to join X" screen
 *   BEFORE the visitor has signed in) must be reachable by an
 *   unauthenticated visitor. Everything else under /api/org(.*) stays
 *   protected, including POST /api/org/invite/[token]/accept, which
 *   legitimately requires auth() — accepting an invite only makes sense
 *   once signed in. isPublicInviteInfo is checked BEFORE isProtectedRoute
 *   and short-circuits past the auth.protect() call for that one exact
 *   route shape only.
 *
 * CHANGE (Part D — guided onboarding):
 *   Added '/onboarding(.*)' to isProtectedRoute. These pages require a
 *   signed-in Clerk user (to know whose org to create / attach payment
 *   to) but deliberately do NOT require org membership — that's the
 *   entire point of the flow, a brand-new user has no org yet when they
 *   land here. Org-membership requirements are enforced further down
 *   the stack (dashboard/layout.tsx), not in middleware.
 *
 * UNCHANGED:
 *   All other entries exactly match the original middleware.ts.
 *   /v/[publicToken] is intentionally NOT in this list — it is a public route.
 *   /api/cron/* is intentionally NOT in this list — it uses CRON_SECRET, not Clerk.
 *   /invite/[token] is intentionally NOT in this list — it is a public route,
 *   reachable before sign-in so the "you've been invited" screen can render;
 *   the SignIn/SignUp embedded within it handles auth, and the accept API
 *   route (already protected via /api/org(.*)) enforces auth() itself.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',      // Part D — ADDED. Auth required, org NOT required.
  '/api/memorial(.*)',    // V1 singular — unchanged
  '/api/memorials(.*)',  // V2 plural   — ADDED
  '/api/dashboard(.*)',
  '/api/billing/checkout',
  '/api/billing/portal',
  '/api/billing/status',
  '/api/org(.*)',
  '/api/onboarding(.*)',  // Part D — ADDED
]);

// Matches GET /api/org/invite/{token} exactly — NOT
// /api/org/invite/{token}/accept (that stays protected) and NOT any
// other /api/org/* route. path-to-regexp (what createRouteMatcher uses
// under the hood) needs its own param syntax here, not a hand-written
// regex character class — ':token' matches exactly one path segment by
// default, which is exactly "one thing after /invite/, nothing more".
const isPublicInviteInfo = createRouteMatcher([
  '/api/org/invite/:token',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicInviteInfo(req)) {
    return;
  }
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
