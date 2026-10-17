import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { classifyPath, edgeDecision, isApiPath, parseEdgeAuthMode } from '@/lib/edgeAuth';

// R2/CDN origin for uploaded photos/videos/logos — only set in production
// (dev serves from local disk, already covered by 'self'). Guarded so an
// unset value in dev doesn't inject the literal string "undefined" into
// the CSP's img-src.
const cdnOrigin = process.env.NEXT_PUBLIC_CDN_URL;

// EDGE ROUTE PROTECTION (defence in depth) — see lib/edgeAuth.ts for the full
// rationale and the path lists. Every page and API route STILL authenticates and
// authorises itself; this layer only guarantees that a signed-out request never
// reaches the protected ones, so a future route that forgets its own check is
// not automatically public.
//
// EDGE_AUTH_MODE:
//   log     (default outside production) blocks nothing; logs "[edge-auth] WOULD BLOCK …" for every
//           signed-out request that enforce mode would stop. Safe to deploy.
//   enforce (DEFAULT in production) signed-out → API paths get 401 JSON, pages redirect to /sign-in.
//           Unrecognised paths are blocked too (deny by default).
//   off     does nothing (emergency switch — no redeploy of code needed).
// Roll-out: ship in `log`, watch the logs while using the app, then set
// EDGE_AUTH_MODE=enforce in Vercel and redeploy.
export default clerkMiddleware(async (auth, req) => {
  const mode = parseEdgeAuthMode(process.env.EDGE_AUTH_MODE);
  if (mode === 'off') return;

  const { pathname } = req.nextUrl;
  if (classifyPath(pathname) === 'public') return; // skip the session lookup entirely

  const session  = await auth();
  const decision = edgeDecision(pathname, mode, !!session.userId);

  if (decision === 'block') {
    // x-edge-auth marks responses produced HERE (vs. by a route's own check),
    // so a 401 can be traced to the layer that issued it.
    if (isApiPath(pathname)) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401, headers: { 'x-edge-auth': 'blocked' } });
    }
    // Built by hand (not session.redirectToSignIn, which is typed to throw and
    // so can't be inspected or tagged). redirect_url is Clerk's own parameter;
    // it carries a same-site PATH only, never a full URL (no open redirect).
    const signIn = new URL(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in', req.url);
    signIn.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn, { headers: { 'x-edge-auth': 'blocked' } });
  }

  if (decision === 'allow-and-log') {
    // Pathname only — never the query string, which can carry tokens.
    console.warn(`[edge-auth] WOULD BLOCK ${req.method} ${pathname} (signed out; EDGE_AUTH_MODE=log, nothing was blocked)`);
  }
}, {
  contentSecurityPolicy: {
    // Was previously not configured at all — see the old comment this
    // replaced: the blocker (requires @clerk/nextjs >= 6.14.0) was
    // resolved when this project upgraded to ^7.8.0, but the follow-up
    // was never done, so the app shipped with zero CSP. This is Clerk's
    // own built-in generator (non-strict/"default" mode — see
    // https://clerk.com/docs/guides/secure/best-practices/csp-headers),
    // which correctly includes Clerk's frontend API, abuse/fraud
    // protection domains, and Cloudflare's challenge host without this
    // app needing to hand-maintain that list.
    directives: {
      // Memorial photos, tribute videos, org logos — served from R2 in
      // production via NEXT_PUBLIC_CDN_URL. Without this, Clerk's
      // default img-src ('self' https://img.clerk.com) blocks every one
      // of them.
      //
      // data: is REQUIRED for QR codes — the QR page (and QRCodeDisplay,
      // DownloadQRButton) render qrcode's toDataURL() output as
      // <img src="data:image/png;base64,...">. Clerk's default img-src has no
      // data:, so the browser refused every QR image ("Refused to load the
      // image 'data:...' because it violates the Content Security Policy").
      // blob: covers object-URL previews of files chosen for upload.
      'img-src': ['data:', 'blob:', ...(cdnOrigin ? [cdnOrigin] : [])],
      // app/globals.css (loaded on every page) and two inline
      // @import-based style blocks (the QR print page, the memorial
      // appearance editor) all pull from Google Fonts. Clerk's default
      // style-src ('self' 'unsafe-inline') allows the inline @import
      // syntax itself but not fetching the stylesheet cross-origin;
      // there's no default font-src at all, which falls back to
      // default-src 'self' and would block the font files themselves.
      //
      // font-src NEEDS 'self' TOO. Declaring font-src REPLACES the
      // default-src fallback rather than adding to it, so listing only
      // fonts.gstatic.com silently blocked every font served from this
      // origin — including fonts self-hosted by next/font (the landing
      // page's Plus Jakarta Sans), which would have fallen back to a system
      // font in production with no error anyone would see.
      // Staff bulk upload PUTs files straight to the R2 bucket from the
      // browser via presigned URLs (virtual-hosted <bucket>.<account>.r2…
      // or path-style <account>.r2…). Without this the browser blocks the
      // request before it leaves the page ("violates connect-src").
      'connect-src': ['https://*.r2.cloudflarestorage.com'],
      'style-src': ['https://fonts.googleapis.com'],
      'font-src':  ["'self'", 'https://fonts.gstatic.com'],
    },
  },
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
