import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { classifyPath, edgeDecision, parseEdgeAuthMode } from '../edgeAuth';

// ── 1. The guard that stops a new route being forgotten ─────────────────────
const APP = join(__dirname, '..', '..', 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** app/api/foo/[id]/route.ts → /api/foo/x ;  app/(g)/page.tsx → / */
function toUrl(file: string): string {
  const rel = relative(APP, file).split(sep);
  rel.pop(); // route.ts / page.tsx
  const segs = rel
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    .map((s) => (s.startsWith('[[...') || s.startsWith('[...') ? 'x/y' : s.startsWith('[') ? 'x' : s));
  return '/' + segs.join('/');
}

const files  = walk(APP);
const routes = files.filter((f) => /[\\/]route\.ts$/.test(f)).map((f) => ({ file: f, url: toUrl(f) }));
const pages  = files.filter((f) => /[\\/]page\.tsx$/.test(f)).map((f) => ({ file: f, url: toUrl(f) }));

describe('every route and page in app/ is classified (deny-by-default guard)', () => {
  it('finds a realistic number of routes (the scan itself is working)', () => {
    expect(routes.length).toBeGreaterThan(80);
    expect(pages.length).toBeGreaterThan(30);
  });

  it('NO route or page is unclassified — a new one must be added to lib/edgeAuth.ts on purpose', () => {
    const unclassified = [...routes, ...pages].filter((r) => classifyPath(r.url) === 'unclassified').map((r) => r.url);
    expect(unclassified, `Add these to PROTECTED or PUBLIC in lib/edgeAuth.ts:\n${unclassified.join('\n')}`).toEqual([]);
  });

  it('every PROTECTED api route really authenticates itself too (defence in depth, both layers)', () => {
    const guard = /\bauth\(|getOrgForUser|assertMemorialAccess|assertPlatformAdmin|withPlatformAdmin|withBillingOrg|getOrgContextForUser|getOrgIdForUser|isValidCronSecret/;
    const missing = routes
      .filter((r) => classifyPath(r.url) === 'protected')
      .filter((r) => !guard.test(readFileSync(r.file, 'utf8')))
      .map((r) => r.url);
    expect(missing).toEqual([]);
  });

  it('every PUBLIC api route defends itself some other way (token, rate limit, cron secret, session)', () => {
    const defence = /token|Token|checkRateLimit|isValidCronSecret|\bauth\(|assertFamilyAccess/;
    const bare = routes
      .filter((r) => r.url.startsWith('/api/') && classifyPath(r.url) === 'public')
      .filter((r) => !defence.test(readFileSync(r.file, 'utf8')))
      .map((r) => r.url);
    expect(bare).toEqual([]);
  });
});

// ── 2. Specific classifications that must never regress ─────────────────────
describe('classifyPath', () => {
  it('protects the staff area and its APIs', () => {
    for (const p of ['/dashboard', '/dashboard/memorials', '/dashboard/system/billing', '/onboarding',
      '/api/memorial/abc/photos', '/api/memorials/abc', '/api/dashboard/stats', '/api/billing/status',
      '/api/billing/usage', '/api/system/billing/usage', '/api/org/branding', '/api/onboarding/create-org',
      '/api/health', '/api/music/proxy', '/api/test-email']) {
      expect(classifyPath(p), p).toBe('protected');
    }
  });

  it('keeps public routes public — even those that SHARE a prefix with protected ones', () => {
    // '/api/memorial-access' starts with '/api/memorial' but is a public family endpoint.
    expect(classifyPath('/api/memorial-access/unlock')).toBe('public');
    expect(classifyPath('/api/memorial')).toBe('protected');
    expect(classifyPath('/api/memorial/abc')).toBe('protected');
    // '/memorial/...' is the public page; '/m/...' too — and '/m' must not swallow '/memorial'.
    expect(classifyPath('/memorial/abc')).toBe('public');
    expect(classifyPath('/m/abc')).toBe('public');
    for (const p of ['/', '/sign-in', '/sign-up', '/v/some-slug', '/slideshow/abc', '/collect/tok', '/upload/tok',
      '/family/dashboard/abc', '/family-access-expired', '/handover/accept/tok', '/invite/tok',
      '/pet-intake/tok', '/pet-tracker/tok', '/terms', '/privacy', '/robots.txt', '/sitemap.xml']) {
      expect(classifyPath(p), p).toBe('public');
    }
    for (const p of ['/api/public/memorial/x/guest-book', '/api/public/memorial/x/memory', '/api/collect/tok',
      '/api/upload/tok', '/api/family-access/m1/verify', '/api/pet-intake/tok', '/api/pet-tracker/tok',
      '/api/handover/accept/tok', '/api/cron/billing']) {
      expect(classifyPath(p), p).toBe('public');
    }
  });

  it('org invite: the token lookup is public, but accept/revoke/create are not', () => {
    expect(classifyPath('/api/org/invite/abc-123')).toBe('public');
    expect(classifyPath('/api/org/invite/abc-123/accept')).toBe('protected');
    expect(classifyPath('/api/org/invite/abc-123/revoke')).toBe('protected');
    expect(classifyPath('/api/org/invite')).toBe('protected');
  });

  it('unknown and tricky paths are NOT waved through (deny by default)', () => {
    for (const p of ['/%64ashboard', '//dashboard', '/Dashboard', '/dashboard%2F..', '/api/brand-new-route', '/admin', '/api']) {
      expect(classifyPath(p), p).toBe('unclassified');
    }
  });
});

// ── 3. The decision table ───────────────────────────────────────────────────
describe('edgeDecision', () => {
  it('enforce: blocks signed-out requests to protected AND unclassified paths, never to public ones', () => {
    expect(edgeDecision('/dashboard', 'enforce', false)).toBe('block');
    expect(edgeDecision('/api/billing/status', 'enforce', false)).toBe('block');
    expect(edgeDecision('/api/brand-new-route', 'enforce', false)).toBe('block');
    expect(edgeDecision('/%64ashboard', 'enforce', false)).toBe('block');
    expect(edgeDecision('/memorial/abc', 'enforce', false)).toBe('allow');
    expect(edgeDecision('/api/public/memorial/x/guest-book', 'enforce', false)).toBe('allow');
    expect(edgeDecision('/api/cron/billing', 'enforce', false)).toBe('allow');
  });
  it('enforce: signed-in users are never blocked', () => {
    expect(edgeDecision('/dashboard', 'enforce', true)).toBe('allow');
    expect(edgeDecision('/api/brand-new-route', 'enforce', true)).toBe('allow');
  });
  it('log: NEVER blocks anything — it only reports (this is what makes shipping it safe)', () => {
    for (const p of ['/dashboard', '/api/billing/status', '/api/brand-new-route', '/memorial/abc', '/']) {
      for (const signedIn of [true, false]) {
        expect(edgeDecision(p, 'log', signedIn)).not.toBe('block');
      }
    }
    expect(edgeDecision('/dashboard', 'log', false)).toBe('allow-and-log');
    expect(edgeDecision('/memorial/abc', 'log', false)).toBe('allow');
  });
  it('off: does nothing', () => {
    expect(edgeDecision('/dashboard', 'off', false)).toBe('allow');
  });
});

describe('parseEdgeAuthMode', () => {
  it('is forgiving: case/whitespace tolerated, anything unknown or unset falls back to the SAFE mode (log)', () => {
    expect(parseEdgeAuthMode('ENFORCE')).toBe('enforce');
    expect(parseEdgeAuthMode(' Off ')).toBe('off');
    expect(parseEdgeAuthMode('log')).toBe('log');
    for (const v of [undefined, null, '', 'true', 'on', 'banana', 'enforced']) expect(parseEdgeAuthMode(v)).toBe('log');
  });
});
