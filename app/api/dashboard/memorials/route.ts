import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { CommonErrors, successResponse, logError, handlePrismaError } from '@/lib/errors';
// ── ADDED: SaaS launch imports ───────────────────────────────────────────────
import { getOrgIdForUser } from '@/lib/tenant';
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
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse({ memorials });

  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      return handlePrismaError(error);
    }
    logError('GET /api/dashboard/memorials', error);
    return CommonErrors.internal();
  }
}
