// lib/direct-upload.ts  (SERVER ONLY)
//
// Shared engine for "browser → bucket" uploads. Vercel Functions reject
// request bodies over ~4.5MB, so any route that receives file bytes itself
// (multipart POST) silently fails in production for ordinary phone photos and
// for videos. Instead:
//
//   1. PREPARE  — client sends file metadata; server applies the rules
//                 (type, per-file size, memorial storage cap, optional
//                 allowed types) and returns a presigned PUT URL per file.
//   2. (browser PUTs each file straight to the bucket)
//   3. VERIFY   — server re-checks what ACTUALLY landed: key is one it could
//                 have issued for this memorial, object exists, real size,
//                 magic bytes, storage cap on real sizes. Failures are
//                 deleted from the bucket. The calling route then records
//                 whatever it likes (CollectionItem, TributeVideo, …).
//
// Used by: staff bulk upload, staff single upload, public family upload link,
// tribute video. Adding another flow = a thin prepare route + a thin complete
// route around these two functions.

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyFileContent } from '@/lib/file-validation';
import { getMemorialStorageUsage } from '@/lib/storage-quota';
import {
  BULK_LIMITS, extensionOf, isBulkKeyForMemorial, narrowPlan, planBulkBatch, resolveMimeType, typeForMime,
  type BulkAccepted, type BulkFileInput, type BulkItemType, type BulkRejected,
} from '@/lib/bulk-upload';

/** Direct (presigned) uploads only exist in production; dev uses local disk. */
export function directUploadsEnabled(): boolean {
  return process.env.NODE_ENV === 'production';
}

export interface PrepareResult {
  mode: 'direct' | 'server';
  accepted: Array<BulkAccepted & { key?: string; uploadUrl?: string }>;
  rejected: BulkRejected[];
  storage: { usedBytes: number; limitBytes: number; remainingBytes: number };
}

export async function prepareDirectUploads(opts: {
  memorialId: string;
  files: BulkFileInput[];
  /** Restrict to these item types (e.g. photos only for the public link). */
  allowedTypes?: BulkItemType[];
  /** Extra cap on how many files may be accepted (e.g. per-link abuse limit). */
  maxAccept?: number;
}): Promise<PrepareResult> {
  const usage = await getMemorialStorageUsage(opts.memorialId);
  const plan  = planBulkBatch(opts.files, usage.remainingBytes);

  const { accepted, rejected } = narrowPlan(plan, { allowedTypes: opts.allowedTypes, maxAccept: opts.maxAccept });

  if (!directUploadsEnabled()) {
    return { mode: 'server', accepted, rejected, storage: usage };
  }

  const { s3PresignedPut } = await import('@/lib/storage-s3');
  const withUrls = await Promise.all(accepted.map(async (a) => {
    const ext = extensionOf(a.name);
    const key = `collection/${opts.memorialId}/${randomUUID()}${ext ? `.${ext}` : ''}`;
    return { ...a, key, uploadUrl: await s3PresignedPut(key, a.mimeType, a.size) };
  }));
  return { mode: 'direct', accepted: withUrls, rejected, storage: usage };
}

export interface Claim { key: string; name: string; mimeType: string }
export interface VerifiedUpload extends Claim { size: number; type: BulkItemType }
export interface FailedUpload { key: string; name: string; reason: string }

/**
 * Re-verify claimed uploads. Returns the ones safe to record (in claim
 * order, already within the memorial's storage cap) plus the failures
 * (their objects are deleted). Keys already recorded as CollectionItems are
 * reported in `alreadyRecorded` and skipped, so retries are safe.
 */
export async function verifyDirectUploads(opts: {
  memorialId: string;
  raw: unknown[];
  allowedTypes?: BulkItemType[];
  /** Quota bytes to ignore (e.g. the tribute video being replaced). */
  creditBytes?: number;
}): Promise<{ saveable: VerifiedUpload[]; failed: FailedUpload[]; alreadyRecorded: Set<string> }> {
  const { s3Head, s3GetRange } = await import('@/lib/storage-s3');
  const { deleteFile } = await import('@/lib/storage-server');

  const failed: FailedUpload[] = [];
  const claims: Claim[] = [];
  const seen = new Set<string>();

  for (const r of opts.raw as any[]) {
    const key  = r?.key;
    const name = typeof r?.name === 'string' ? r.name.slice(0, BULK_LIMITS.maxFileNameLength) : 'file';
    if (!isBulkKeyForMemorial(key, opts.memorialId) || seen.has(key)) {
      failed.push({ key: String(key ?? ''), name, reason: 'Invalid upload reference' });
      continue; // never touch (or delete) a key we did not issue
    }
    seen.add(key);
    claims.push({ key, name, mimeType: resolveMimeType(name, typeof r?.mimeType === 'string' ? r.mimeType : '') });
  }

  const existing = await prisma.collectionItem.findMany({
    where: { blobKey: { in: claims.map((c) => c.key) } }, select: { blobKey: true },
  });
  const alreadyRecorded = new Set<string>(existing.map((e: { blobKey: string | null }) => e.blobKey as string));
  const todo = claims.filter((c) => !alreadyRecorded.has(c.key));

  const allowed = opts.allowedTypes ? new Set(opts.allowedTypes) : null;
  const verified: VerifiedUpload[] = [];
  const queue = [...todo];

  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const type = typeForMime(c.mimeType);
        if (!type || (allowed && !allowed.has(type))) {
          failed.push({ key: c.key, name: c.name, reason: 'Unsupported file type' }); await deleteFile(c.key); continue;
        }
        const head = await s3Head(c.key);
        if (!head)          { failed.push({ key: c.key, name: c.name, reason: 'Upload did not finish' }); continue; }
        if (head.size <= 0) { failed.push({ key: c.key, name: c.name, reason: 'File is empty' }); await deleteFile(c.key); continue; }
        if (head.size > BULK_LIMITS.maxBytes[type]) {
          failed.push({ key: c.key, name: c.name, reason: 'File too large' }); await deleteFile(c.key); continue;
        }
        const check = verifyFileContent(await s3GetRange(c.key, 4096), c.mimeType);
        if (!check.valid) { failed.push({ key: c.key, name: c.name, reason: check.reason }); await deleteFile(c.key); continue; }
        verified.push({ ...c, size: head.size, type });
      } catch (err) {
        console.error('[direct-upload] verify failed', c.key, err);
        failed.push({ key: c.key, name: c.name, reason: 'Could not verify upload' });
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  const order = new Map(claims.map((c, i) => [c.key, i]));
  verified.sort((a, b) => order.get(a.key)! - order.get(b.key)!);

  const usage = await getMemorialStorageUsage(opts.memorialId);
  let used = Math.max(0, usage.usedBytes - (opts.creditBytes ?? 0));
  const saveable: VerifiedUpload[] = [];
  for (const v of verified) {
    if (used + v.size > usage.limitBytes) {
      failed.push({ key: v.key, name: v.name, reason: "Would exceed this memorial's storage limit" });
      await deleteFile(v.key);
      continue;
    }
    used += v.size;
    saveable.push(v);
  }
  return { saveable, failed, alreadyRecorded };
}
