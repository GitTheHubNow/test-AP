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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
