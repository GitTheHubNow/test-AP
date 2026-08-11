// app/api/music/proxy/route.ts
// Server-side proxy for music files — bypasses COEP for external URLs.
//
// SECURITY: this route previously accepted ANY http/https URL with no auth
// and no host restriction — a classic SSRF (server-side request forgery).
// An attacker could call /api/music/proxy?url=http://169.254.169.254/... to
// probe cloud metadata endpoints, or use this server as an open outbound
// proxy, without ever touching the app's UI.
//
// As of the local-music migration (see prisma/seed-music.ts), all
// MusicTrack.blobKey values are local paths like "music/track.mp3" served
// directly by Next.js — none of the three current callers (slideshow route,
// video page, TributeVideoCreator) ever pass an http(s) URL in practice,
// since each already branches to skip this proxy for local paths.
//
// This route is kept (not deleted) in case a future feature needs to proxy
// a trusted external host (e.g. an R2 pre-signed URL), but is now closed by
// default: authenticated users only, and only for hosts on the allowlist
// below. Add a host here deliberately when you actually need one — do not
// widen this to accept arbitrary URLs again.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Empty by design. All tracks are local files as of this fix — nothing
// should need to hit this route today. Add specific hostnames here only
// when a real external-URL use case exists (e.g. R2 bucket host).
const ALLOWED_HOSTS = new Set<string>([
  // 'your-bucket.your-account.r2.cloudflarestorage.com',
]);

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    console.error(`[music/proxy] Blocked request to disallowed host: ${parsed.hostname}`);
    return new NextResponse('Host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Memoriam/1.0)' },
    });

    const contentType = upstream.headers.get('Content-Type') ?? '';

    // Reject HTML error pages masquerading as audio
    if (contentType.includes('text/html')) {
      console.error(`[music/proxy] Upstream returned HTML for URL: ${url}`);
      return new NextResponse(
        `Upstream URL returned an HTML page, not audio. URL: ${url}`,
        { status: 502 }
      );
    }

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType || 'audio/mpeg',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[music/proxy] error:', err);
    return new NextResponse('Proxy error', { status: 502 });
  }
}
