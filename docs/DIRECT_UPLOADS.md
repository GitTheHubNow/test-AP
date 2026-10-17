# Direct-to-bucket uploads (the Vercel 4.5 MB fix)

## The problem
Vercel Functions reject any request body over ~4.5 MB. Every route that received file bytes
itself (multipart POST) therefore failed in production for ordinary phone photos (3–10 MB) and
could never have saved a tribute video (up to 200 MB). Two of these failures were silent
(the tribute-video save was treated as "non-fatal"). It worked on localhost, which hid it.

## The fix (one pattern, reused)
`lib/direct-upload.ts` (server) + `lib/direct-upload-client.ts` (browser):

1. **prepare** — client sends file *metadata*. Server applies the rules (type, per-file size,
   the memorial's 5 GB storage cap, optional photos-only / per-link limits) and returns a presigned
   PUT URL per accepted file. The URL is signed for **exactly the declared byte length**, so it can't
   be used to push a bigger file into the bucket.
2. **browser PUTs the file straight to R2** (progress, retries).
3. **complete** — server does not trust step 2. It checks the key is one it could have issued for
   this memorial, HEADs the object (real size), re-checks size, reads the first 4 KB and verifies
   magic bytes, re-checks the 5 GB cap on real sizes, deletes anything that fails, then records
   the survivors. Safe to retry.

Local dev (no bucket) automatically falls back to the old multipart routes.

## Where it is used
| Flow | Routes |
|---|---|
| Staff bulk upload (Collection page, up to 100 files/run) | `/api/memorial/[id]/collection/bulk/{prepare,complete}` |
| Staff single-file form (same page) | same routes |
| Family photo link (public, token) | `/api/upload/[token]/{prepare,complete}` |
| Tribute video | `/api/memorial/[id]/video/upload/{prepare,complete}` |

**Not yet converted** (still multipart through the function, so still capped at ~4.5 MB in
production): `/api/collect/[token]` (family *invite* uploads), `/api/family-access/[id]/details`.
Logo and CSV import are small and fine. To convert one: add a thin prepare route around
`prepareDirectUploads` and a thin complete route around `verifyDirectUploads`, then switch its form
to `putWithRetry` / `directUploadOne`.

## REQUIRED one-time setup: R2 CORS
Cloudflare dashboard → R2 → your bucket → Settings → CORS policy (use your real app origin(s)):
```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP-DOMAIN"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
The app's CSP `connect-src` already allows `https://*.r2.cloudflarestorage.com` (proxy.ts).

## Env
- `DIRECT_UPLOAD_SIGN_LENGTH` (default on). If your storage provider ever rejects the signed
  length (uploads fail with 403 SignatureDoesNotMatch), set it to `false` — the server still
  verifies every object before recording it.

## Test on a preview deploy first
1. Family link: upload one 6–10 MB photo → should appear Unsorted in the Collection.
2. Staff: drop ~20 mixed files on the Collection page; try one unsupported file and one that
   would exceed the cap.
3. Render a tribute video → it should now persist (check the memorial's video page after reload).

## Known limits
- If someone closes the tab after the browser PUT but before *complete*, the object is orphaned
  in the bucket (not counted, not shown). Public links make this the one abuse path left: bounded by
  rate limits (20 prepares/min per link) and the exact-length signature, but a periodic sweep of
  unreferenced `collection/<id>/…` objects older than a day is the real fix — not built, because
  deleting from a bucket should be tested against your data first.
- Quota is check-then-write (as before); `complete` re-checks on real sizes to keep it tight.
- `sizeBytes` columns are 32-bit ints → single files must stay under 2 GB (limits are far below).
