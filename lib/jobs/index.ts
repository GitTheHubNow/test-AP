import { prisma } from '@/lib/prisma';
import { runIntegrityCheck } from '@/lib/immutability';
import { applyRetentionPolicies } from '@/lib/retention';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';

export enum JobType {
  INTEGRITY_CHECK = 'INTEGRITY_CHECK',
  AUDIT_CLEANUP = 'AUDIT_CLEANUP',
  AUTO_SEAL = 'AUTO_SEAL',
  COMPLIANCE_EXPORT = 'COMPLIANCE_EXPORT',
}

export enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface JobResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

/**
 * Job execution framework for background tasks.
 */
export class JobExecutor {
  async executeJob(jobType: JobType): Promise<JobResult> {
    console.log(`[Job] Starting ${jobType}...`);

    try {
      let result: JobResult;

      switch (jobType) {
        case JobType.INTEGRITY_CHECK:
          result = await this.runIntegrityCheckJob();
          break;
        case JobType.AUDIT_CLEANUP:
          result = await this.runAuditCleanupJob();
          break;
        case JobType.AUTO_SEAL:
          result = await this.runAutoSealJob();
          break;
        case JobType.COMPLIANCE_EXPORT:
          result = await this.runComplianceExportJob();
          break;
        default:
          result = {
            success: false,
            message: 'Unknown job type',
            error: `Invalid job type: ${jobType}`,
          };
      }

      console.log(`[Job] ${jobType} completed:`, result.message);
      return result;
    } catch (error: any) {
      console.error(`[Job] ${jobType} failed:`, error);
      return {
        success: false,
        message: 'Job execution failed',
        error: error.message,
      };
    }
  }

  private async runIntegrityCheckJob(): Promise<JobResult> {
    const report = await runIntegrityCheck();

    if (report.corruptedCount > 0) {
      // Create audit events for corrupted entities
      for (const corruption of report.corrupted) {
        await prisma.auditEvent.create({
          data: {
            entityType: corruption.entityType as any,
            entityId: corruption.entityId,
            action: AuditAction.UPDATE,
            actorId: 'system',
            actorRole: ActorRole.SYSTEM,
            reasonCode: ReasonCode.VERIFICATION,
            metadata: {
              integrityCheckFailed: true,
              issue: corruption.issue,
              jobType: JobType.INTEGRITY_CHECK,
            },
          },
        });
      }

      return {
        success: false,
        message: `Integrity violations detected: ${report.corruptedCount}`,
        data: report,
      };
    }

    return {
      success: true,
      message: `All ${report.totalChecked} entities verified`,
      data: report,
    };
  }

  private async runAuditCleanupJob(): Promise<JobResult> {
    // Delegates to lib/retention.ts's policy table instead of hardcoding
    // the 90-day/READ-only rule here a second time — this file used to
    // have its own copy of the same logic, which risked drifting out of
    // sync if retention rules ever changed in only one place.
    const result = await applyRetentionPolicies();

    return {
      success: true,
      message: `Cleaned up ${result.deleted} audit events across ${result.policies.length} retention polic${result.policies.length === 1 ? 'y' : 'ies'}`,
      data: result,
    };
  }

  private async runAutoSealJob(): Promise<JobResult> {
    // Auto-seal approved memories older than 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const memories = await prisma.memory.findMany({
      where: {
        status: 'APPROVED',
        sealed: false,
        createdAt: {
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        authorName: true,
        message: true,
      },
      take: 100, // Batch size
    });

    let sealedCount = 0;

    for (const memory of memories) {
      try {
        await prisma.$transaction(async (tx) => {
          const contentHash = createHash('sha256')
            .update(JSON.stringify({ authorName: memory.authorName, message: memory.message }))
            .digest('hex');

          await tx.memory.update({
            where: { id: memory.id },
            data: {
              sealed: true,
              sealedAt: new Date(),
              contentHash,
            },
          });

          await tx.auditEvent.create({
            data: {
              entityType: EntityType.MEMORY,
              entityId: memory.id,
              action: AuditAction.SEAL,
              actorId: 'system',
              actorRole: ActorRole.SYSTEM,
              reasonCode: ReasonCode.VERIFICATION,
              metadata: {
                autoSealed: true,
                contentHash,
              },
            },
          });
        });

        sealedCount++;
      } catch (error) {
        console.error(`Failed to auto-seal memory ${memory.id}:`, error);
      }
    }

    return {
      success: true,
      message: `Auto-sealed ${sealedCount} memories`,
      data: { sealedCount, candidateCount: memories.length },
    };
  }

  private async runComplianceExportJob(): Promise<JobResult> {
    // Generate monthly compliance report
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0);

    const auditEvents = await prisma.auditEvent.count({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return {
      success: true,
      message: `Compliance export ready for ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      data: {
        period: { start: startDate, end: endDate },
        auditEventCount: auditEvents,
      },
    };
  }
}

// Import for hash
import { createHash } from 'crypto';