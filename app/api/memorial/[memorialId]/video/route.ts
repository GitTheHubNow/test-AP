import { NextRequest, NextResponse } from 'next/server';
import { auth }                       from '@clerk/nextjs/server';
import { prisma }                     from '@/lib/prisma';
// ── ADDED: SaaS launch imports ───────────────────────────────────────────────
import { getOrgIdForUser }                                    from '@/lib/tenant';
import { checkEntitlement, incrementUsage, entitlementError } from '@/lib/entitlement';
// ────────────────────────────────────────────────────────────────────────────
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
  { params }: { params: { memorialId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(params.memorialId, userId, 'read');
  } catch (err) {
    return handleAuthError(err);
  }

  const video = await prisma.tributeVideo.findUnique({
    where: { memorialId: params.memorialId },
  });

  return NextResponse.json({ success: true, data: { video } });
}

/**
 * POST /api/memorial/[memorialId]/video
 * Create or update tribute video config (upsert).
 * Org-scoped edit access (previously a manual ownerId check that
 * blocked org staff — fixed to use assertMemorialAccess).
 *
 * Entitlement check fires only on first-time CREATE (status DRAFT → being set up).
 * Updates to an existing video record are always allowed — the limit applies
 * to starting new renders, not saving config changes.
 *
 * Body: { theme, musicTrackId, photoOrder, titleCardText, endCardText, showOnMemorial }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { memorialId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 });

  try {
    await assertMemorialAccess(params.memorialId, userId, 'edit');
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

  // ── ADDED: Entitlement check — only when triggering a new render ──────────
  // A render is triggered when status transitions to RENDERING or COMPLETE.
  // Config saves (no status change) are always free.
  const isRenderTrigger = body.status === 'RENDERING' || body.status === 'COMPLETE';

  // Declared here (outer function scope) rather than as `var` inside the
  // nested `if` block below — `var` in that position was function-scoped
  // in JS terms, but TypeScript's control-flow analysis couldn't prove it
  // was assigned by the time it's read after the upsert (TS2454). Giving
  // it an explicit `string | null` type and initialising to null up front
  // makes the assignment provable and the intent explicit: "no org to
  // charge usage against unless a first render was actually triggered".
  let orgIdForIncrement: string | null = null;

  if (isRenderTrigger) {
    // Check if this memorial already has a completed video — re-renders are free,
    // only the first render on a fresh video counts against the monthly limit.
    const existing = await prisma.tributeVideo.findUnique({
      where:  { memorialId: params.memorialId },
      select: { status: true },
    });

    const isFirstRender = !existing || existing.status === 'DRAFT';

    if (isFirstRender) {
      const orgId = await getOrgIdForUser(userId);
      const check = await checkEntitlement(orgId, 'videosPerMonth');
      if (!check.allowed) return entitlementError(check.reason!);

      // Increment after successful upsert — done below
      orgIdForIncrement = orgId;
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  const video = await prisma.tributeVideo.upsert({
    where:  { memorialId: params.memorialId },
    create: {
      memorialId:     params.memorialId,
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

  // ── ADDED: Increment usage counter after first render ────────────────────
  if (isRenderTrigger && orgIdForIncrement) {
    await incrementUsage(orgIdForIncrement, 'videosThisMonth');
  }
  // ────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ success: true, data: { video } });
}
