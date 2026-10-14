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
      // issues with third-party scripts (Clerk).
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
          // Content-Security-Policy is set in proxy.ts via Clerk's
          // built-in CSP generator (clerkMiddleware({ contentSecurityPolicy })),
          // not here — Clerk's version injects it per-request alongside
          // its own auth logic, and merging a second CSP header from
          // next.config.js would conflict with it rather than combine.
        ],
      },
    ];
  },
};

module.exports = nextConfig;
