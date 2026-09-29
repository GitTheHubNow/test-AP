// app/api/org/branding/logo/route.ts
//
// POST /api/org/branding/logo
//
// Accepts a multipart form upload of a logo image.
// Saves to storage under orgs/${orgId}/logo and updates Organisation.logoUrl.
// Returns the public URL.
//
// Reuses saveUploadedFile from lib/storage-server — same pattern as
// app/api/memorial/[memorialId]/video/upload/route.ts.
// Max size: 2 MB. Accepted types: image/png, image/jpeg, image/webp.
//
// image/svg+xml was previously accepted here (and nowhere else in the
// app) with no magic-byte check at all — lib/file-validation.ts has no
// SVG case (see its own file-level comment calling out "mislabeled
// HTML/SVG-with-script payload" as exactly the stored-XSS risk this
// module exists to catch), so there was no safe way to verify an SVG's
// content here. SVGs can embed <script> and execute it if the file is
// opened directly (not via <img>, but a direct link to the uploaded
// asset would run it) — dropped rather than "validated" with a check
// that doesn't exist.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser }            from '@/lib/tenant';
import { saveUploadedFile }           from '@/lib/storage-server';
import { getPublicUrl }               from '@/lib/upload-shared';
import { verifyFileContent }          from '@/lib/file-validation';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES      = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });
    }

    const orgId = await getOrgIdForUser(userId);
    if (!orgId) {
      return NextResponse.json({ success: false, error: 'No organisation' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No logo file provided' }, { status: 400 });
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type. Accepted: ${ACCEPTED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Logo must be under 2 MB' },
        { status: 400 },
      );
    }

    // Magic-byte check — verify the file's actual content matches its
    // declared type, rather than trusting the client-supplied
    // Content-Type header alone. Was missing here even though every
    // other upload route in the app has it — see lib/file-validation.ts
    // for why it matters: uploads are served directly by URL (via S3/R2
    // in production, public/uploads/** in dev), so a mislabeled file is
    // a stored XSS risk against anyone who opens the link, not just a
    // data-integrity issue.
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentCheck = verifyFileContent(buffer, file.type);
    if (!contentCheck.valid) {
      return NextResponse.json({ success: false, error: contentCheck.reason }, { status: 400 });
    }

    // Save to storage — dev: /public/uploads/orgs/${orgId}/logo, prod: S3
    const blobKey = await saveUploadedFile(file, `orgs/${orgId}/logo`);
    const url     = getPublicUrl(blobKey);

    // Persist the URL on the org record
    await prisma.organisation.update({
      where: { id: orgId },
      data:  { logoUrl: url },
    });

    return NextResponse.json({ success: true, data: { url, blobKey } });

  } catch (err: any) {
    console.error('[org/branding/logo/POST]', err);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
