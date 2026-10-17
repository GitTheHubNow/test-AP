// lib/edgeAuth.ts
//
// Edge route protection: which URL paths require a signed-in Clerk session,
// decided in the proxy BEFORE any page or route code runs.
//
// WHY THIS EXISTS. proxy.ts used to protect routes via an isProtectedRoute
// list; commit 58d27ee removed it, leaving every route to authenticate itself.
// That works today, but one forgotten check in a new route is a public hole.
// This restores the safety net as DEFENCE IN DEPTH — every route still does its
// own auth + authorisation; this only guarantees a signed-out request never
// reaches the protected ones.
//
// DESIGN
//   · Pure functions, no Clerk import → fully unit-testable.
//   · DENY BY DEFAULT: a path matching neither list is 'unclassified' and, in
//     enforce mode, is treated as protected. A new route that someone forgets
//     to classify fails closed — and edgeAuth.test.ts scans the whole app/
//     directory and FAILS THE BUILD for any unclassified route, so it can't be
//     forgotten silently. It also means odd paths ("/%64ashboard", "//dashboard")
//     that dodge a prefix match are protected rather than waved through.
//   · Three modes (EDGE_AUTH_MODE): off | log | enforce. Default is `enforce` in
//     production and `log` elsewhere; `log` blocks nothing and just reports what WOULD be blocked, so this can
//     be deployed with zero risk of locking anyone out, then switched to
//     enforce once the logs are clean.

export type PathClass = 'protected' | 'public' | 'unclassified';
export type EdgeAuthMode = 'off' | 'log' | 'enforce';
export type EdgeDecision = 'allow' | 'allow-and-log' | 'block';

// Matches a prefix at a path-segment boundary, so '/api/memorial' matches
// '/api/memorial' and '/api/memorial/x' but NOT '/api/memorial-access/unlock'.
const prefix = (p: string) => new RegExp(`^${p.replace(/\//g, '\\/')}(?:\\/|$)`);

// Public ON PURPOSE even though they sit under a protected prefix. Checked first.
const PUBLIC_EXCEPTIONS: RegExp[] = [
  /^\/api\/org\/invite\/[^/]+\/?$/, // GET invite info by token. (…/accept and …/revoke are NOT exempt.)
];

const PROTECTED: RegExp[] = [
  // pages
  prefix('/dashboard'),
  prefix('/onboarding'),
  // APIs
  prefix('/api/memorial'),
  prefix('/api/memorials'),
  prefix('/api/dashboard'),
  prefix('/api/billing'),
  prefix('/api/onboarding'),
  prefix('/api/org'),
  prefix('/api/system'),
  prefix('/api/health'),
  prefix('/api/music'),
  prefix('/api/test-email'),
];

// Public by design: reached by families / visitors / cron with no Clerk account.
// Each of these authenticates by other means (a secret token, a signed cookie,
// the cron secret) and rate-limits itself.
const PUBLIC: RegExp[] = [
  /^\/$/,
  // pages
  prefix('/sign-in'), prefix('/sign-up'),
  prefix('/m'), prefix('/v'), prefix('/memorial'), prefix('/slideshow'),
  prefix('/collect'), prefix('/upload'),
  prefix('/family'), prefix('/family-access-expired'),
  prefix('/handover'), prefix('/invite'),
  prefix('/pet-intake'), prefix('/pet-tracker'),
  // Legal pages — linked from the landing footer and the onboarding agreement.
  // (The pages themselves are not written yet; registering them now means they
  // are reachable signed-out the moment they exist.)
  prefix('/terms'), prefix('/privacy'),
  // APIs
  prefix('/api/public'), prefix('/api/collect'), prefix('/api/upload'),
  prefix('/api/family-access'), prefix('/api/memorial-access'),
  prefix('/api/pet-intake'), prefix('/api/pet-tracker'),
  prefix('/api/handover'), // accept/[token]: GET shows the link, POST does its own sign-in + email check
  prefix('/api/cron'),     // guarded by CRON_SECRET, not a user session
  // well-known files the matcher doesn't skip
  /^\/robots\.txt$/, /^\/sitemap\.xml$/, /^\/\.well-known(?:\/|$)/,
];

export function classifyPath(pathname: string): PathClass {
  if (PUBLIC_EXCEPTIONS.some((r) => r.test(pathname))) return 'public';
  if (PROTECTED.some((r) => r.test(pathname))) return 'protected';
  if (PUBLIC.some((r) => r.test(pathname))) return 'public';
  return 'unclassified';
}

/** Forgiving on purpose (a typo in an env var must never take the site down). Unknown → 'log'. */
export function parseEdgeAuthMode(raw: string | undefined | null): EdgeAuthMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'off' || v === 'enforce' || v === 'log') return v;
  // Unset/unrecognised: fail CLOSED in production, stay permissive in dev/test.
  // (This used to be 'log' everywhere, i.e. edge protection silently did
  // nothing on a production deploy that forgot to set the variable.)
  return process.env.NODE_ENV === 'production' ? 'enforce' : 'log';
}

export function edgeDecision(pathname: string, mode: EdgeAuthMode, signedIn: boolean): EdgeDecision {
  if (mode === 'off' || signedIn) return 'allow';
  const cls = classifyPath(pathname);
  if (cls === 'public') return 'allow';
  // protected OR unclassified, signed out:
  return mode === 'enforce' ? 'block' : 'allow-and-log';
}

export const isApiPath = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/');
