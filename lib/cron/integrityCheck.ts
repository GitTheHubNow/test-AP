import { runIntegrityCheck } from '@/lib/immutability';
import { prisma } from '@/lib/prisma';
import {
  EntityType,
  AuditAction,
  ActorRole,
  ReasonCode,
} from '@/lib/audit';

/**
 * Periodic integrity check job.
 * Should be run daily via cron or scheduled task.
 * 
 * Usage: node -e "require('./lib/cron/integrityCheck').runDailyIntegrityCheck()"
 */
export async function runDailyIntegrityCheck() {
  console.log('[IntegrityCheck] Starting daily integrity verification...');
  
  try {
    const report = await runIntegrityCheck();
    
    console.log(`[IntegrityCheck] Checked ${report.totalChecked} entities`);
    console.log(`[IntegrityCheck] Found ${report.corruptedCount} integrity violations`);
    
    if (report.corruptedCount > 0) {
      console.error('[IntegrityCheck] CRITICAL: Integrity violations detected!');
      console.error(JSON.stringify(report.corrupted, null, 2));
      
      // Log to audit trail
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
              detectedAt: new Date().toISOString(),
            },
          },
        });
      }
      
      // TODO: Send alert to administrators
      // await sendAdminAlert('Integrity violations detected', report);
    } else {
      console.log('[IntegrityCheck] All integrity checks passed');
    }
    
    return report;
  } catch (error) {
    console.error('[IntegrityCheck] Failed:', error);
    throw error;
  }
}

// Allow direct execution
if (require.main === module) {
  runDailyIntegrityCheck()
    .then(() => {
      console.log('[IntegrityCheck] Job completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[IntegrityCheck] Job failed:', error);
      process.exit(1);
    });
}