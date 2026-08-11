/**
 * lib/upload-shared.ts
 *
 * CLIENT-SAFE only — no Node.js APIs, no fs, no AWS.
 * Safe to import in any client component, server component, or API route.
 *
 * Server-only storage operations (saveUploadedFile, deleteFile) live in:
 *   lib/storage-server.ts
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE:        50 * 1024 * 1024,
  MAX_FILES_PER_MEMORY: 3,
  // Local-disk fallback storage path — used by lib/upload-server.ts only.
  // Production storage goes through lib/storage-s3.ts (R2), not this file.
  UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR ?? './uploads',
  ALLOWED_MIME_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
};

// ============================================================================
// PUBLIC URL — client-safe
// ============================================================================

export function getPublicUrl(blobKey: string): string {
  if (!blobKey) return '';
  if (blobKey.startsWith('http://') || blobKey.startsWith('https://')) {
    return blobKey;
  }
  if (process.env.NODE_ENV === 'production') {
    const cdn = process.env.NEXT_PUBLIC_CDN_URL ?? '';
    if (cdn) return `${cdn.replace(/\/$/, '')}/${blobKey}`;
    const bucket = process.env.AWS_S3_BUCKET ?? '';
    const region = process.env.AWS_REGION ?? 'ap-southeast-2';
    return `https://${bucket}.s3.${region}.amazonaws.com/${blobKey}`;
  }
  return `/uploads/${blobKey}`;
}
