// lib/storage-quota.ts
//
// Enforces STORAGE_MB_PER_MEMORIAL (lib/stripe.ts) — a flat, per-memorial
// cumulative storage cap covering every CollectionItem's file
// (photos/documents/videos uploaded via any of the collection routes)
// plus the tribute video, if rendered. Previously declared but never
// checked anywhere (see the comment on STORAGE_MB_PER_MEMORIAL itself);
// this file is what actually enforces it. See getMemorialStorageUsage's
// own comment below for why CollectionItem (not Media) is the right
// table to sum.
//
// Deliberately a single shared helper rather than duplicating a usage
// query in every upload route — four different routes write a
// CollectionItem or a TributeVideo, and a cap that's checked four
// different ways with four different bugs is worse than no cap at all.

import { prisma } from '@/lib/prisma';
import { STORAGE_MB_PER_MEMORIAL } from '@/lib/stripe';

export const STORAGE_BYTES_PER_MEMORIAL = STORAGE_MB_PER_MEMORIAL * 1024 * 1024;

export interface StorageUsage {
  usedBytes:      number;
  limitBytes:     number;
  remainingBytes: number;
}

/**
 * Current total storage used by a memorial.
 *
 * Sums CollectionItem.sizeBytes + TributeVideo.sizeBytes — deliberately
 * NOT Media.sizeBytes. Traced every actual file-storage write site in
 * this codebase before writing this: every upload route (staff
 * collection, public upload-link, invite-based collect) writes a
 * CollectionItem row with the real blobKey + sizeBytes. The ONE place
 * that creates a Media row (collection/[itemId]/route.ts, when an item
 * is "promoted" to a public Memory) copies the SAME blobKey and
 * sizeBytes from the already-existing CollectionItem onto a new Media
 * row — it's a second database record pointing at the same physical
 * bytes, not a second copy of the file. Summing Media.sizeBytes on top
 * of CollectionItem.sizeBytes would double-count every promoted item.
 *
 * Deliberately does NOT distinguish by CollectionItem.status. A
 * rejected/unsorted item still sits in blob storage costing real
 * money/quota until something actually deletes it — excluding it here
 * would let an org get effectively unlimited storage by uploading,
 * getting rejected, and re-uploading, since rejected items would never
 * count. If rejected media should eventually be garbage-collected,
 * that's a separate cleanup job, not something this quota check should
 * paper over by pretending the bytes aren't there.
 */
export async function getMemorialStorageUsage(memorialId: string): Promise<StorageUsage> {
  const [collectionAgg, video] = await Promise.all([
    prisma.collectionItem.aggregate({
      where: { memorialId },
      _sum:  { sizeBytes: true },
    }),
    prisma.tributeVideo.findUnique({
      where:  { memorialId },
      select: { sizeBytes: true },
    }),
  ]);

  const usedBytes = (collectionAgg._sum.sizeBytes ?? 0) + (video?.sizeBytes ?? 0);

  return {
    usedBytes,
    limitBytes:     STORAGE_BYTES_PER_MEMORIAL,
    remainingBytes: Math.max(0, STORAGE_BYTES_PER_MEMORIAL - usedBytes),
  };
}

export interface QuotaCheckResult {
  allowed: boolean;
  usage:   StorageUsage;
  /** Human-readable error string, only set when allowed is false. */
  error?:  string;
}

/**
 * Checks whether `incomingBytes` more storage can be added to a memorial
 * without exceeding its quota. Does NOT reserve/commit the usage — this
 * is a check-then-write pattern (see the race-condition note on
 * assertStorageQuotaAvailable below), matching how every existing upload
 * route in this codebase already validates before writing.
 */
export async function checkStorageQuota(
  memorialId:    string,
  incomingBytes: number,
): Promise<QuotaCheckResult> {
  const usage = await getMemorialStorageUsage(memorialId);

  if (usage.usedBytes + incomingBytes > usage.limitBytes) {
    const usedMb      = (usage.usedBytes / (1024 * 1024)).toFixed(0);
    const limitMb      = STORAGE_MB_PER_MEMORIAL;
    const incomingMb   = (incomingBytes / (1024 * 1024)).toFixed(0);
    return {
      allowed: false,
      usage,
      error: `Storage limit reached: this memorial has used ${usedMb}MB of its ${limitMb}MB limit, and this upload (${incomingMb}MB) would exceed it.`,
    };
  }

  return { allowed: true, usage };
}

/**
 * Throws (as a plain Error with a `status` property, matching the
 * Object.assign(new Error(...), { status }) pattern already used by
 * assertFeatureEnabled/assertOrgMember elsewhere in this codebase) if
 * the quota would be exceeded. Callers in route handlers should catch
 * and translate `status` into the HTTP response, same as those helpers.
 *
 * NOTE — race condition, by design, not overlooked: this is a
 * check-then-write, not an atomic reservation. Two concurrent uploads
 * that each individually fit under the remaining quota could both pass
 * this check and together exceed it. Given realistic usage (a funeral
 * home's own staff uploading photos, or a small number of family members
 * uploading one at a time), true concurrent uploads to the same memorial
 * are rare enough that this is an acceptable tradeoff versus the
 * complexity of a real distributed lock or a DB-level constraint for a
 * cap that exists to bound cost, not to be a hard security boundary.
 */
export async function assertStorageQuotaAvailable(
  memorialId:    string,
  incomingBytes: number,
): Promise<StorageUsage> {
  const result = await checkStorageQuota(memorialId, incomingBytes);
  if (!result.allowed) {
    throw Object.assign(new Error(result.error), { status: 413 }); // 413 Payload Too Large
  }
  return result.usage;
}
