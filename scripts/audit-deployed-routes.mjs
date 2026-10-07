#!/usr/bin/env node
//
// audit-deployed-routes.mjs — catches exactly the bug class that just bit
// us: a route exists in the source tree (app/api/**/route.ts) but the
// live deployment 404s on it, because the file never actually made it
// into the deployed build (never committed, never pushed, build used an
// older commit, etc.). `git status`/`git log` tell you what SHOULD be
// deployed; this tells you what the live site ACTUALLY has.
//
// WHAT IT DOES: walks app/api/**/route.ts in THIS working directory (so
// run it from a checkout that matches what you believe is deployed —
// typically right after `git pull` on main), builds the real route list
// from the file system (not a hand-maintained list that goes stale),
// and fires one lightweight request per route at the URL you give it.
//
// HOW IT TELLS "MISSING" FROM "EXISTS BUT REJECTED THE REQUEST": a route
// that exists but correctly rejects a request you're not authorised/
// well-formed enough for still returns Next.js's own JSON (or a non-404
// status like 401/403/400/405/500) — the framework matched a real
// route.ts and ran it. A route that genuinely isn't deployed gets Next's
// generic 404 PAGE — HTML starting with <!DOCTYPE or <html — because
// there's no route.ts there for the framework to match at all. That HTML
// is exactly what caused the "Unexpected token '<'" error that started
// this. This script's whole job is detecting that one specific signature,
// across every route at once, instead of finding it one route at a time
// by hand.
//
// SAFETY: GET requests use no body. Non-GET requests (anywhere a route
// doesn't export GET) send `{}` as the body — deliberately empty/invalid,
// so a route that exists will reject it with a validation error (400) or
// an auth error, not actually create a real row in your database or a
// real file in R2. This still isn't zero-risk against a route with no
// input validation at all; it's a route-existence check, not a fuzzer,
// and shouldn't be pointed at anything you don't own.
//
// USAGE:
//   node scripts/audit-deployed-routes.mjs https://test-ap-nine.vercel.app
//
// Requires Node 18+ (built-in fetch). No dependencies.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/audit-deployed-routes.mjs https://your-deployed-url');
  process.exit(1);
}
const TARGET = target.replace(/\/$/, '');
const SLEEP_MS = 400; // be polite to the app's own rate limiters

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 1. Walk app/api for every route.ts, in source order ──────────────────
function findRouteFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findRouteFiles(full, out);
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

const API_ROOT = 'app/api';
let routeFiles;
try {
  routeFiles = findRouteFiles(API_ROOT);
} catch (err) {
  console.error(`Could not read ${API_ROOT} — run this from your project root (the folder containing "app/"). ${err.message}`);
  process.exit(1);
}

// ── 2. For each file, extract its URL path + which HTTP methods it
// exports, and substitute dynamic segments ([token], [memorialId], etc.)
// with a harmless placeholder — we're checking the route is reachable at
// all, not exercising it with real IDs.
const routes = routeFiles.map((file) => {
  const urlPath = '/' + file
    .slice(API_ROOT.length + 1, -'/route.ts'.length)
    .replace(/\[([^\]]+)\]/g, 'audit-probe-$1'); // [token] -> audit-probe-token

  const content = readFileSync(file, 'utf8');
  const methods = [...content.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PATCH|PUT|DELETE)\b/g)]
    .map((m) => m[1]);

  // Prefer GET (cleanest signal, no body needed); fall back to whatever's
  // exported. A route with no recognised export is flagged separately —
  // that's a different, code-level problem this script can still surface.
  const method = methods.includes('GET') ? 'GET' : (methods[0] ?? null);

  return { file, urlPath: '/api' + urlPath, methods, method };
});

console.log(`Found ${routes.length} route files under ${API_ROOT}/`);
console.log(`Target: ${TARGET}`);
console.log('');

// ── 3. Probe each one, classify the result ────────────────────────────────
const missing = [];
const noExportFound = [];
const errored = [];
const ok = [];

for (const route of routes) {
  if (!route.method) {
    noExportFound.push(route);
    continue;
  }

  const url = TARGET + route.urlPath;
  try {
    const res = await fetch(url, {
      method: route.method,
      headers: route.method === 'GET' ? {} : { 'content-type': 'application/json' },
      body: route.method === 'GET' ? undefined : '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    const looksLikeHtml = /^\s*<(!DOCTYPE|html)/i.test(text);

    if (res.status === 404 && looksLikeHtml) {
      missing.push({ ...route, status: res.status });
      console.log(`[MISSING]  ${route.method.padEnd(6)} ${route.urlPath}  -> 404, HTML body (framework 404 — route not deployed)`);
    } else {
      ok.push({ ...route, status: res.status });
      console.log(`[present]  ${route.method.padEnd(6)} ${route.urlPath}  -> ${res.status}`);
    }
  } catch (err) {
    errored.push({ ...route, error: err.message });
    console.log(`[ERROR]    ${route.method.padEnd(6)} ${route.urlPath}  -> ${err.message}`);
  }

  await sleep(SLEEP_MS);
}

// ── 4. Summary ─────────────────────────────────────────────────────────
console.log('');
console.log('────────────────────────────────────────────────');
console.log(`Checked: ${routes.length}   Present: ${ok.length}   Missing: ${missing.length}   Errored: ${errored.length}   No method export: ${noExportFound.length}`);

if (missing.length) {
  console.log('');
  console.log('MISSING (exists in source, 404s live — not deployed, or deployed from an older commit):');
  for (const r of missing) console.log(`  ${r.urlPath}  (source: ${r.file})`);
}

if (noExportFound.length) {
  console.log('');
  console.log('NO RECOGNISED METHOD EXPORT (not checked — read these manually, this is a code issue not a deploy issue):');
  for (const r of noExportFound) console.log(`  ${r.file}`);
}

if (errored.length) {
  console.log('');
  console.log('ERRORED (network/timeout — inconclusive, not necessarily missing):');
  for (const r of errored) console.log(`  ${r.urlPath}: ${r.error}`);
}

console.log('');
console.log('A route marked [present] may still reject every real request (wrong auth,');
console.log('bad input) — that is expected and correct. This script only answers "does');
console.log('the live deployment know this route exists at all", which is the specific');
console.log('question that mattered for the memory/guest-book bug.');

process.exit(missing.length > 0 ? 1 : 0);
