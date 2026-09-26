import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError } from '@/lib/errors';
// ── ADDED: SaaS launch imports ───────────────────────────────────────────────
import { getOrgIdForUser } from '@/lib/tenant';
import { resolveMemorialFields } from '@/lib/memorial/resolveMemorialFields';
// ────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return CommonErrors.unauthorized();

    // ── CHANGED: org-scoped query instead of ownerId ─────────────────────────
    // Falls back gracefully: if a memorial has no organisationId (created before
    // this migration), it still appears via the ownerId fallback in the OR clause.
    const orgId = await getOrgIdForUser(userId);

    const memorials = await prisma.memorial.findMany({
      where: {
        OR: [
          { organisationId: orgId },          // new org-scoped memorials
          { ownerId: userId, organisationId: null }, // legacy pre-migration memorials
        ],
      },
      // ────────────────────────────────────────────────────────────────────────
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        // ── ADDED: include workflow stage and service date for dashboard cards
        workflowStage: true,
        serviceTime: true,
        firstName: true,
        lastName: true,
        // ── ADDED: needed to build /v/{slug}?key={publicToken} public links.
        // publicToken may be null (generated lazily on first QR panel open) —
        // the list page falls back to /dashboard/.../qr for those rows.
        slug: true,
        publicToken: true,
        // ── ADDED: "needs action" alert — same fields the memorial journey
        // tracker and locked-section gates already use (see
        // lib/memorial/journeyGate.ts and components/journey/MemorialJourney.tsx),
        // just surfaced here too so it's visible at a glance from the list.
        funeralDate:          true,
        publishPromptSentAt:  true,
        tributeUnlockOverride: true,
        // PRIORITY 3 FIX: funeralDate/firstName/lastName above drive the
        // "Ready to publish" / "No service date set" alerts and the
        // list's name display below — stale on a case-linked memorial
        // once staff edit the case instead. nominatedName/nominatedEmail/
        // venueName/venueAddress aren't used by this route but are
        // required by resolveMemorialFields()'s input shape.
        nominatedName:  true,
        nominatedEmail: true,
        venueName:      true,
        venueAddress:   true,
        funeralCase: {
          select: {
            deceasedName: true, serviceDate: true,
            familyContact: true, contactEmail: true,
            venueName: true, venueAddress: true,
          },
        },
        handover: { select: { status: true } },
        _count: { select: { memories: { where: { status: 'PENDING' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withAlerts = memorials.map(m => {
      const { _count, handover, funeralCase, ...rest } = m;
      const pendingCount = _count.memories;
      const resolved = resolveMemorialFields(m);

      // Same "day before service" timing as the publish-prompt email
      // (lib/memorial/journeyGate.ts: PUBLISH_PROMPT_DAYS_BEFORE) — kept
      // as an inline day-diff here rather than importing the job-facing
      // helper, since this only needs a yes/no, not the exact count.
      const now = new Date();
      const daysUntilService = resolved.funeralDate
        ? Math.round((new Date(resolved.funeralDate).setHours(0,0,0,0) - new Date(now).setHours(0,0,0,0)) / 86400000)
        : null;

      const alerts: { type: string; label: string }[] = [];

      if (pendingCount > 0) {
        alerts.push({ type: 'pending', label: `${pendingCount} to review` });
      }
      if (
        resolved.funeralDate &&
        daysUntilService !== null &&
        daysUntilService <= 1 &&
        m.workflowStage !== 'LIVE' &&
        m.workflowStage !== 'HANDED_OVER'
      ) {
        alerts.push({ type: 'publish', label: 'Ready to publish' });
      }
      if (!resolved.funeralDate && m.status === 'ACTIVE') {
        alerts.push({ type: 'no-date', label: 'No service date set' });
      }
      if (handover?.status === 'PENDING') {
        alerts.push({ type: 'handover', label: 'Handover awaiting family' });
      }

      return {
        ...rest,
        firstName:   resolved.firstName,
        lastName:    resolved.lastName,
        funeralDate: resolved.funeralDate,
        alerts,
      };
    });

    return successResponse({ memorials: withAlerts });

  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      return handlePrismaError(error);
    }
    logError('GET /api/dashboard/memorials', error);
    return CommonErrors.internal();
  }
}
