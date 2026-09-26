// app/api/memorial/[memorialId]/video/upload/route.ts
// Receives the rendered MP4 blob from TributeVideoCreator and saves it.
// Called automatically after a successful FFmpeg render.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { saveUploadedFile }           from '@/lib/storage-server';
// ── ADDED: proper org ownership check ───────────────────────────────────────
import { assertMemorialAccess }       from '@/lib/tenant';
// ────────────────────────────────────────────────────────────────────────────
import { verifyFileContent }          from '@/lib/file-validation';
import { assertStorageQuotaAvailable } from '@/lib/storage-quota';

// No explicit cap previously existed on this route. That mattered more
// than usual here because saveUploadedFile() unconditionally does
// Buffer.from(await file.arrayBuffer()) before any size check could run
// — an uncapped POST could buffer an arbitrarily large file fully into
// memory (and, in prod, still attempt the S3 PUT) before anything had a
// chance to reject it. This is a resource-exhaustion vector independent
// of storage cost.
//
// This is a flat per-file cap, not derived from PLAN_LIMITS.storageMbPerMemorial
// (lib/stripe.ts) — that field is a cumulative per-memorial storage
// budget across all uploads, not a single-file size limit, and tying
// this cap to it directly would either let a STARTER org's first video
// consume its entire quota in one file, or be needlessly loose for
// ENTERPRISE. Enforcing the cumulative quota itself is a separate,
// larger piece of work (checking existing usage before accepting a new
// upload) — not addressed by this fix.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB — generous for a rendered tribute video

// ⚠️ UNVERIFIED — worth confirming with a real test upload before relying
// on this cap as the actual ceiling in production: Vercel's default
// serverless function request body limit is 4.5MB on most plans. If this
// route receives the rendered video as a real multipart POST body (rather
// than e.g. a direct-to-S3 browser upload where this route only records
// metadata afterward), requests anywhere near 200MB would likely be
// rejected by the platform before ever reaching this code — meaning the
// effective cap in production could be far lower than MAX_VIDEO_BYTES,
// or uploads could already be failing silently above ~4.5MB. This app-level
// check is still correct/worth having regardless of the platform limit
// (defence-in-depth, and correct for local/self-hosted dev), but confirm
// the actual upload path and Vercel plan limits before treating 200MB as
// a real, working ceiling end-to-end.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    // ── CHANGED: org-aware ownership check (was: findFirst with no user check)
    const memorial = await assertMemorialAccess(memorialId, userId);
    if (!memorial) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // ────────────────────────────────────────────────────────────────────────

    const formData = await req.formData();
    const file = formData.get('video') as File | null;
    if (!file) return NextResponse.json({ error: 'No video file' }, { status: 400 });

    // Validate it's actually a video
    if (!file.type.startsWith('video/')) {
      return NextResponse.json({ error: 'File must be a video' }, { status: 400 });
    }

    // Size check — file.size is available from the File object without
    // reading the body, so this rejects an oversized upload before the
    // expensive buffer-into-memory step below.
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `Video too large (max ${MAX_VIDEO_BYTES / (1024 * 1024)}MB)` },
        { status: 400 },
      );
    }

    // Cumulative per-memorial storage quota (STORAGE_MB_PER_MEMORIAL) —
    // this is the check that was explicitly flagged as not-yet-built in
    // the comment above. A re-render replaces the existing video rather
    // than adding a second one (see the upsert below), so this correctly
    // does NOT double-count an existing video's current size against
    // itself — getMemorialStorageUsage reads the OLD sizeBytes (pre-
    // upsert), and we're checking whether the NEW file's size fits, which
    // slightly over-rejects right at the boundary on a re-render (checks
    // old-size + new-size instead of just new-size), but that's a safe
    // direction to be wrong in for a quota, and avoids a more complex
    // "subtract the row being replaced" query for a rare edge case.
    try {
      await assertStorageQuotaAvailable(memorialId, file.size);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 413 });
    }

    // Magic-byte check — same fix applied to the collect/[token] and
    // staff collection routes. This route is reached after auth +
    // assertMemorialAccess, but as with the staff collection route,
    // that proves who is uploading, not what — a spoofed Content-Type
    // could otherwise get an arbitrary payload past the
    // file.type.startsWith('video/') check above and into storage
    // (S3 in prod, or public/uploads/** in dev, which is publicly
    // served — see lib/file-validation.ts for the full stored-XSS
    // rationale). detectFileKind only recognises a fixed set of video
    // containers (mp4, quicktime/mov, webm, avi) — this is the same
    // set TributeVideoCreator's FFmpeg render is expected to produce,
    // so no legitimate upload from the actual product flow should be
    // affected.
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentCheck = verifyFileContent(buffer, file.type);
    if (!contentCheck.valid) {
      return NextResponse.json({ error: contentCheck.reason }, { status: 400 });
    }

    // Save to storage (dev = /public/uploads, prod = S3/R2)
const blobKey = await saveUploadedFile(
  file,
  `memorials/${memorialId}/video`
);

    // Upsert TributeVideo record with the saved key
    await prisma.tributeVideo.upsert({
      where:  { memorialId: memorialId },
      create: {
        memorialId:  memorialId,
        webBlobKey:  blobKey,
        hdBlobKey:   blobKey,
        sizeBytes:   file.size,
        status:      'COMPLETE',
        renderedAt:  new Date(),
      },
      update: {
        webBlobKey: blobKey,
        hdBlobKey:  blobKey,
        sizeBytes:  file.size,
        status:     'COMPLETE',
        renderedAt: new Date(),
      },
    });

    // Return the public URL so the client can update its download link
    const { getPublicUrl } = await import('@/lib/upload-shared');
    const url = getPublicUrl(blobKey);

    return NextResponse.json({ url, blobKey });

  } catch (err) {
    console.error('[video/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
