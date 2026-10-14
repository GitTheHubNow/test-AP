import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
import { recordUsage }       from '@/lib/billing/usage';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError } from '@/lib/errors';

/**
 * GET /api/memorial/[memorialId]/video
 * Load current tribute video config.
 * Org-scoped read access (previously a manual ownerId check that
 * blocked org staff — fixed to use assertMemorialAccess).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(memorialId, userId, 'read');
  } catch (err) {
    return handleAuthError(err);
  }

  const video = await prisma.tributeVideo.findUnique({
    where: { memorialId: memorialId },
  });

  return NextResponse.json({ success: true, data: { video } });
}

/**
 * POST /api/memorial/[memorialId]/video
 * Create or update tribute video config (upsert).
 * Org-scoped edit access (previously a manual ownerId check that
 * blocked org staff — fixed to use assertMemorialAccess).
 *
 * Starting a render records one (idempotent) usage-ledger row for the
 * memorial; saving config changes does not.
 *
 * Body: { theme, musicTrackId, photoOrder, titleCardText, endCardText, showOnMemorial }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  let body: {
    theme?:          string;
    musicTrackId?:   string | null;
    photoOrder?:     any[];
    titleCardText?:  string | null;
    endCardText?:    string | null;
    showOnMemorial?: boolean;
    status?:         string;
    hdBlobKey?:      string | null;
    webBlobKey?:     string | null;
  };

  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

  // A render is triggered when status transitions to RENDERING or COMPLETE.
  // Config saves (no status change) never touch the usage ledger.
  const isRenderTrigger = body.status === 'RENDERING' || body.status === 'COMPLETE';

  const video = await prisma.tributeVideo.upsert({
    where:  { memorialId: memorialId },
    create: {
      memorialId:     memorialId,
      theme:          (body.theme as any)       ?? 'CLASSIC',
      musicTrackId:   body.musicTrackId         ?? null,
      photoOrder:     body.photoOrder           ?? [],
      titleCardText:  body.titleCardText        ?? null,
      endCardText:    body.endCardText          ?? null,
      showOnMemorial: body.showOnMemorial       ?? false,
      status:         (body.status as any)      ?? 'DRAFT',
      hdBlobKey:      body.hdBlobKey            ?? null,
      webBlobKey:     body.webBlobKey           ?? null,
    },
    update: {
      ...(body.theme          !== undefined ? { theme:          body.theme as any   } : {}),
      ...(body.musicTrackId   !== undefined ? { musicTrackId:   body.musicTrackId   } : {}),
      ...(body.photoOrder     !== undefined ? { photoOrder:     body.photoOrder     } : {}),
      ...(body.titleCardText  !== undefined ? { titleCardText:  body.titleCardText  } : {}),
      ...(body.endCardText    !== undefined ? { endCardText:    body.endCardText    } : {}),
      ...(body.showOnMemorial !== undefined ? { showOnMemorial: body.showOnMemorial } : {}),
      ...(body.status         !== undefined ? { status:         body.status as any  } : {}),
      ...(body.hdBlobKey      !== undefined ? { hdBlobKey:      body.hdBlobKey      } : {}),
      ...(body.webBlobKey     !== undefined ? { webBlobKey:     body.webBlobKey     } : {}),
    },
  });

  // BILLING: record the render in the usage ledger. Idempotent per memorial
  // (unique on type + memorialId), so re-renders and the RENDERING→COMPLETE
  // transition record exactly once — no "is this the first render" check
  // needed. Tracked at $0 (see lib/billing/pricing.ts).
  if (isRenderTrigger) {
    const memorial = await prisma.memorial.findUnique({
      where:  { id: memorialId },
      select: { organisationId: true, title: true },
    });
    if (memorial?.organisationId) {
      try {
        await recordUsage(prisma, {
          organisationId: memorial.organisationId,
          type:           'TRIBUTE_VIDEO_RENDERED',
          memorialId,
          memorialTitle:  memorial.title,
        });
      } catch (err) {
        // The video itself is saved; never fail the request over a $0 tracking row.
        console.error(`[video] failed to record usage for memorial ${memorialId}:`, err);
      }
    }
  }

  return NextResponse.json({ success: true, data: { video } });
}
