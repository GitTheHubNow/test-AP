/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      enabled: true,
    },
  },

  // Image domains for Next.js Image component
  images: {
    remotePatterns: [
      // Add your CDN domain here once R2 is configured:
      // { protocol: 'https', hostname: 'media.yourdomain.com' },
    ],
  },

  async headers() {
    return [
      // ── FFmpeg WASM headers ──────────────────────────────────────────────
      // SharedArrayBuffer requires these — but ONLY on the video page.
      // Applying to all routes breaks fetch() in API routes and causes
      // issues with third-party scripts (Stripe, Clerk).
      {
        source: '/dashboard/memorial/:memorialId/video',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },

      // ── Security headers — applied to all routes ─────────────────────────
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
          { key: 'X-DNS-Prefetch-Control',   value: 'on' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
          // Strict-Transport-Security — tells browsers to only ever
          // connect over HTTPS for the next year, including subdomains,
          // and allows preload-list submission. Safe to add regardless
          // of app version — this is a browser/server contract, not
          // dependent on any library.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          //
          // NOT YET ADDED: Content-Security-Policy.
          // Clerk (@clerk/nextjs) ships a built-in CSP generator via
          // clerkMiddleware({ contentSecurityPolicy: {...} }) that
          // correctly whitelists all of Clerk's + Stripe's required
          // domains (frontend API, telemetry, challenges.cloudflare.com,
          // js.stripe.com, etc.) — see
          // https://clerk.com/docs/guides/secure/best-practices/csp-headers
          // That feature requires @clerk/nextjs >= 6.14.0; this project
          // is currently on ^5.7.5. Hand-writing a CSP against the
          // wrong/incomplete domain list risks silently breaking sign-in
          // or checkout in production — worse than shipping without one
          // for now. TRACKED FOLLOW-UP: upgrade @clerk/nextjs deliberately
          // (its own dedicated session — this is a major-version-range
          // jump, not a drop-in bump), then add the CSP via
          // clerkMiddleware's built-in support.
        ],
      },
    ];
  },
};

module.exports = nextConfig;
