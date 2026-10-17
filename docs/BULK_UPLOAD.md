# Staff bulk upload

Collection page → **Bulk upload**. Staff drop up to 100 photos / videos / documents per run.
Everything lands as **Unsorted** in the Collection for review, like any other staff upload.

## Limits
- **5 GB per memorial total** (`STORAGE_MB_PER_MEMORIAL` in `lib/storage-quota.ts`) — the same cap
  every other upload route enforces. Files are accepted in the order dropped until the memorial is
  full; the rest are rejected with "Would exceed this memorial's storage limit". Nothing goes over.
- Per file: 50 MB photos/documents, 200 MB video (same as the single-file routes).
- 100 files per run (drop more in further runs).
- Types: JPG, PNG, WebP, HEIC/HEIF, MP4, MOV, AVI, WebM, PDF, DOC, DOCX.

## How it works (and why)
Vercel Functions reject request bodies over ~4.5 MB, so files can't pass through an API route.
1. `POST …/collection/bulk/prepare` — browser sends file names/types/sizes. Server applies the rules
   above and returns a short-lived presigned R2 URL per accepted file.
2. Browser PUTs each file straight to R2 (3 at a time, progress, 2 retries).
3. `POST …/collection/bulk/complete` — server does NOT trust step 2: it checks each key is one it
   issued for this memorial, HEADs the object (real size), re-checks per-file size, reads the first
   4 KB and verifies magic bytes, re-checks the 5 GB cap on real sizes, deletes anything that fails,
   and records the rest (+ one audit event each). Safe to retry.

Local dev (no bucket) falls back to the existing single-file route, one file at a time.

## REQUIRED one-time setup: R2 CORS
The browser PUTs cross-origin to R2, so the bucket needs a CORS rule (Cloudflare dashboard →
R2 → your bucket → Settings → CORS policy). Use your real app origin(s):

```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP-DOMAIN"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
(The app's CSP `connect-src` already allows `https://*.r2.cloudflarestorage.com` — see proxy.ts.)

## Known limits / follow-ups
- If a user closes the tab after step 2 but before step 3, the uploaded objects are orphaned in the
  bucket (they are not counted toward quota or shown). A periodic cleanup of unreferenced
  `collection/<id>/…` objects older than a day would reclaim them.
- Quota is check-then-write, like the other routes: two staff bulk-uploading to the SAME memorial at
  the same instant could overshoot slightly. `complete` re-checks on real sizes to keep it tight.
- `CollectionItem.sizeBytes` is a 32-bit Int, so single files must stay under 2 GB (limits are far below).
