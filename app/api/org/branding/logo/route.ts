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
// Max size: 2 MB. Accepted types: image/png, image/jpeg, image/svg+xml, image/webp.

import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { getOrgIdForUser }            from '@/lib/tenant';
import { saveUploadedFile }           from '@/lib/storage-server';
import { getPublicUrl }               from '@/lib/upload-shared';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
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
