import { clerkMiddleware } from '@clerk/nextjs/server';

// R2/CDN origin for uploaded photos/videos/logos — only set in production
// (dev serves from local disk, already covered by 'self'). Guarded so an
// unset value in dev doesn't inject the literal string "undefined" into
// the CSP's img-src.
const cdnOrigin = process.env.NEXT_PUBLIC_CDN_URL;

export default clerkMiddleware({
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
      'img-src': cdnOrigin ? [cdnOrigin] : [],
      // app/globals.css (loaded on every page) and two inline
      // @import-based style blocks (the QR print page, the memorial
      // appearance editor) all pull from Google Fonts. Clerk's default
      // style-src ('self' 'unsafe-inline') allows the inline @import
      // syntax itself but not fetching the stylesheet cross-origin;
      // there's no default font-src at all, which falls back to
      // default-src 'self' and would block the font files themselves.
      'style-src': ['https://fonts.googleapis.com'],
      'font-src':  ['https://fonts.gstatic.com'],
    },
  },
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
