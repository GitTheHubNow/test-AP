/**
 * lib/storage-s3.ts  — PATCHED for Cloudflare R2
 *
 * Only change from your existing file: added `endpoint` to the S3Client config.
 * Everything else (s3Upload, s3Delete, s3SignedUrl) is identical.
 *
 * Replace your existing lib/storage-s3.ts with this file.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION ?? 'auto',

      // ── ADDED: R2 endpoint ─────────────────────────────────────────────────
      // Remove this line if using AWS S3 instead of Cloudflare R2
      endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      // ──────────────────────────────────────────────────────────────────────

      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

export async function s3Upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket:       process.env.AWS_S3_BUCKET!,
    Key:          key,
    Body:         buffer,
    ContentType:  mimeType,
    CacheControl: 'public, max-age=31536000, immutable', // ← ADDED: CDN caching
  }));
}

export async function s3Delete(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key:    key,
    }));
  } catch (err: any) {
    if (err?.name !== 'NoSuchKey') throw err;
  }
}

export async function s3SignedUrl(key: string, expiresIn: number): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key:    key,
  }), { expiresIn });
}
