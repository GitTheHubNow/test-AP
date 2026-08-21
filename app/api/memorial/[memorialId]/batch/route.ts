import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';
import { MemoryStatus } from '@prisma/client';
import { assertMemorialAccess } from '@/lib/auth/getOrgForUser';
import { handleAuthError, logError } from '@/lib/errors';

/**
 * POST /api/memorial/[memorialId]/batch
 *
 * ⚠️ FILENAME BUG (fixed by this file): the original file at this route
 * folder was named `route .ts` (note the space before the extension),
 * not `route.ts`. Next.js App Router only recognises the exact filename
 * `route.ts` — this endpoint was NOT reachable at all, regardless of any
 * other bug in it. Bulk approve/reject for memories was likely silently
 * broken (404) wherever the frontend tried to call it. Delete the old
 * `route .ts` file and replace it with this one, named `route.ts` exactly
 * (no trailing space), in the same
 * `app/api/memorial/[memorialId]/batch/` folder.
 *
 * Bulk approve or reject up to 50 pending memories in one request.
 * Org-scoped edit access (previously a manual ownerId check that would
 * also have blocked org staff, on top of being unreachable — fixed to
 * use assertMemorialAccess).
 */

interface BatchOperation {
  action: 'approve' | 'reject';
  memoryIds: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memorialId: string }> }
) {
  const { memorialId } = await params;

  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    await assertMemorialAccess(memorialId, userId, 'edit');
  } catch (err) {
    return handleAuthError(err);
  }

  let body: BatchOperation;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }

  if (!body.action || !body.memoryIds || !Array.isArray(body.memoryIds)) {
    return NextResponse.json(
      { error: 'Invalid batch operation' },
      { status: 400 }
    );
  }

  if (body.memoryIds.length === 0) {
    return NextResponse.json(
      { error: 'No memories specified' },
      { status: 400 }
    );
  }

  if (body.memoryIds.length > 50) {
    return NextResponse.json(
      { error: 'Batch size limited to 50 memories' },
      { status: 400 }
    );
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const processed: string[] = [];
      const failed: string[] = [];

      // Single findMany up front instead of one findUnique per item —
      // was doing a separate round-trip per memoryId just to check
      // memorialId/status, on top of the update + auditEvent.create
      // that also happen per item. For a 50-item batch that's up to
      // 150 sequential round-trips; this cuts it to roughly 51
      // (1 lookup + up to 50 update/audit pairs, which have to stay
      // per-row since each write needs its own audit log entry and
      // its own pass/fail outcome for the response).
      const foundMemories = await tx.memory.findMany({
        where: { id: { in: body.memoryIds } },
        select: { id: true, memorialId: true, status: true },
      });
      const memoryById = new Map(foundMemories.map(m => [m.id, m]));

      for (const memoryId of body.memoryIds) {
        try {
          const memory = memoryById.get(memoryId);

          if (!memory || memory.memorialId !== memorialId) {
            failed.push(memoryId);
            continue;
          }

          if (memory.status !== MemoryStatus.PENDING) {
            failed.push(memoryId);
            continue;
          }

          if (body.action === 'approve') {
            await tx.memory.update({
              where: { id: memoryId },
              data: { status: MemoryStatus.APPROVED },
            });

            await tx.auditEvent.create({
              data: {
                entityType: EntityType.MEMORY,
                entityId: memoryId,
                action: AuditAction.APPROVE,
                actorId: userId,
                actorRole: ActorRole.OWNER,
                reasonCode: ReasonCode.APPROVAL,
                metadata: {
                  batchOperation: true,
                  previousStatus: MemoryStatus.PENDING,
                  newStatus: MemoryStatus.APPROVED,
                },
              },
            });
          } else if (body.action === 'reject') {
            await tx.memory.update({
              where: { id: memoryId },
              data: { 
                status: MemoryStatus.REJECTED,
                rejectedAt: new Date(),
              },
            });

            await tx.auditEvent.create({
              data: {
                entityType: EntityType.MEMORY,
                entityId: memoryId,
                action: AuditAction.REJECT,
                actorId: userId,
                actorRole: ActorRole.OWNER,
                reasonCode: ReasonCode.REJECTION,
                metadata: {
                  batchOperation: true,
                  previousStatus: MemoryStatus.PENDING,
                  newStatus: MemoryStatus.REJECTED,
                },
              },
            });
          }

          processed.push(memoryId);
        } catch (error) {
          // Was a bare swallow — failed.push(memoryId) tells the caller
          // WHICH item failed but the actual reason was previously
          // discarded entirely, with no trace anywhere. Response shape
          // to the client is unchanged.
          logError(`batch operation failed for memoryId ${memoryId}`, error);
          failed.push(memoryId);
        }
      }

      return { processed, failed };
    });

    return NextResponse.json({
      success: true,
      processed: results.processed.length,
      failed: results.failed.length,
      failedIds: results.failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Batch operation failed' },
      { status: 500 }
    );
  }
}
