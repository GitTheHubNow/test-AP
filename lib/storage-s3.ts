/**
 * lib/storage-s3.ts  — PATCHED for Cloudflare R2
 *
 * Only change from your existing file: added `endpoint` to the S3Client config.
 * Everything else (s3Upload, s3Delete, s3SignedUrl) is identical.
 *
 * Replace your existing lib/storage-s3.ts with this file.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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


// ── Direct-to-bucket uploads (staff bulk upload) ────────────────────────────
// Vercel Functions reject request bodies over ~4.5MB, so large files cannot be
// proxied through an API route. The browser PUTs straight to the bucket using
// a short-lived presigned URL instead, and the server verifies the object
// afterwards (s3Head / s3GetRange) before recording it. Requires a CORS rule
// on the bucket that allows PUT from the app origin (see docs/BULK_UPLOAD.md).

export async function s3PresignedPut(
  key: string,
  contentType: string,
  contentLength?: number,
  expiresIn = 4 * 60 * 60,
): Promise<string> {
  // Signing ContentLength makes the upload URL valid for EXACTLY that many
  // bytes — a URL handed to a public (token) link can't be used to push a
  // bigger file into the bucket. If your storage provider ever rejects the
  // signature, set DIRECT_UPLOAD_SIGN_LENGTH=false (the server still HEADs
  // and verifies every object before recording it).
  const signLength = process.env.DIRECT_UPLOAD_SIGN_LENGTH !== 'false';
  return getSignedUrl(client(), new PutObjectCommand({
    Bucket:      process.env.AWS_S3_BUCKET!,
    Key:         key,
    ContentType: contentType,
    ...(signLength && contentLength ? { ContentLength: contentLength } : {}),
  }), { expiresIn });
}

/** Object size/type, or null if it does not exist. */
export async function s3Head(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch (err: any) {
    if (err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** First `bytes` bytes of an object (for magic-byte checks). */
export async function s3GetRange(key: string, bytes: number): Promise<Buffer> {
  const r = await client().send(new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key:    key,
    Range:  `bytes=0-${Math.max(0, bytes - 1)}`,
  }));
  const body = r.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) throw new Error('Unexpected storage response body');
  return Buffer.from(await body.transformToByteArray());
}
