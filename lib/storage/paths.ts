// lib/storage/paths.ts
//
// Centralised storage path builder for Phase 17+.
// All NEW uploads must use these helpers.
//
// Storage uses AWS S3 (@aws-sdk/client-s3 is in package.json).
// These are S3 object key paths.
//
// IMPORTANT:
//   Existing V1 blobKey values are NOT changed by this module.
//   Old blobs remain at their original paths and continue to resolve.
//   This module is forward-only — new uploads get namespaced paths.

// ── Path builders ─────────────────────────────────────────────────────────────

export const StoragePaths = {
  memorialPhoto(orgId: string, memorialId: string, filename: string): string {
    return `orgs/${orgId}/memorials/${memorialId}/photos/${filename}`;
  },

  memorialHero(orgId: string, memorialId: string, filename: string): string {
    return `orgs/${orgId}/memorials/${memorialId}/hero/${filename}`;
  },

  slideshow(orgId: string, memorialId: string, filename: string): string {
    return `orgs/${orgId}/slideshows/${memorialId}/${filename}`;
  },

  orgLogo(orgId: string, filename: string): string {
    return `orgs/${orgId}/brand/${filename}`;
  },

  guestBookPhoto(
    orgId: string,
    memorialId: string,
    entryId: string,
    filename: string,
  ): string {
    return `orgs/${orgId}/memorials/${memorialId}/guestbook/${entryId}/${filename}`;
  },

  tributeVideo(orgId: string, memorialId: string, filename: string): string {
    return `orgs/${orgId}/memorials/${memorialId}/video/${filename}`;
  },

  soloMemorialPhoto(memorialId: string, filename: string): string {
    return `solo/memorials/${memorialId}/photos/${filename}`;
  },

  soloGuestBookPhoto(memorialId: string, entryId: string, filename: string): string {
    return `solo/memorials/${memorialId}/guestbook/${entryId}/${filename}`;
  },
};

// ── Context-aware builder ─────────────────────────────────────────────────────

/**
 * Returns the correct S3 key for a new photo upload.
 * orgId = null means the memorial has no organisation (solo use).
 */
export function buildPhotoPath(
  orgId: string | null,
  memorialId: string,
  filename: string,
): string {
  if (orgId) {
    return StoragePaths.memorialPhoto(orgId, memorialId, filename);
  }
  return StoragePaths.soloMemorialPhoto(memorialId, filename);
}

/**
 * Generates a collision-safe filename from an original filename.
 * Format: {timestamp}-{randomSuffix}.{ext}
 * Example: 1716000000000-x7k2q9a.jpg
 */
export function buildUniqueFilename(originalFilename: string): string {
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'bin';
  const uid = Math.random().toString(36).slice(2, 9);
  return `${Date.now()}-${uid}.${ext}`;
}

// ── MIME type validation ──────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
]);

export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase());
}

export function isAllowedVideoType(mimeType: string): boolean {
  return ALLOWED_VIDEO_TYPES.has(mimeType.toLowerCase());
}

export function isAllowedUploadType(mimeType: string): boolean {
  return (
    isAllowedImageType(mimeType) ||
    isAllowedVideoType(mimeType) ||
    ALLOWED_DOCUMENT_TYPES.has(mimeType.toLowerCase())
  );
}

// ── Size limits ───────────────────────────────────────────────────────────────

export const MAX_PHOTO_BYTES    = 25  * 1024 * 1024;  // 25 MB
export const MAX_VIDEO_BYTES    = 200 * 1024 * 1024;  // 200 MB
export const MAX_DOCUMENT_BYTES = 10  * 1024 * 1024;  // 10 MB

export function maxBytesForType(mimeType: string): number {
  if (isAllowedImageType(mimeType)) return MAX_PHOTO_BYTES;
  if (isAllowedVideoType(mimeType)) return MAX_VIDEO_BYTES;
  return MAX_DOCUMENT_BYTES;
}
