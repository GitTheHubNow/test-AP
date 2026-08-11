import { prisma } from '@/lib/prisma';
import { runIntegrityCheck } from '@/lib/immutability';
import {
  EntityType,
  AuditAction,
  getAuditEvents,
} from '@/lib/audit';

export interface SystemHealthReport {
  timestamp: Date;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  checks: {
    database: HealthCheck;
    auditTrail: HealthCheck;
    immutability: HealthCheck;
    deleteProtection: HealthCheck;
  };
  metrics: {
    totalMemorials: number;
    totalMemories: number;
    totalAuditEvents: number;
    sealedMemorials: number;
    sealedMemories: number;
  };
}

export interface HealthCheck {
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

/**
 * Run comprehensive system health check.
 * Verifies all audit and immutability constraints.
 */
export async function runSystemHealthCheck(): Promise<SystemHealthReport> {
  const timestamp = new Date();
  const checks = {
    database: await checkDatabaseConnection(),
    auditTrail: await checkAuditTrailIntegrity(),
    immutability: await checkImmutabilityEnforcement(),
    deleteProtection: await checkDeleteProtection(),
  };

  const metrics = await collectSystemMetrics();

  // Determine overall status
  const hasFailure = Object.values(checks).some(c => c.status === 'FAIL');
  const hasWarning = Object.values(checks).some(c => c.status === 'WARNING');
  
  const status = hasFailure ? 'CRITICAL' : hasWarning ? 'WARNING' : 'HEALTHY';

  return {
    timestamp,
    status,
    checks,
    metrics,
  };
}

async function checkDatabaseConnection(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'PASS',
      message: 'Database connection healthy',
    };
  } catch (error: any) {
    return {
      status: 'FAIL',
      message: 'Database connection failed',
      details: error.message,
    };
  }
}

async function checkAuditTrailIntegrity(): Promise<HealthCheck> {
  try {
    // FIXED: AuditEvent has no field-level @map — only @@map("audit_events")
    // on the table itself — so its columns are the real camelCase names
    // (entityId, entityType), not snake_case. Raw SQL needs them
    // double-quoted or Postgres lowercases them to entityid/entitytype
    // and the column genuinely doesn't exist under that name, which is
    // exactly the "column ae.entity_id does not exist" error this was
    // producing on every call.
    const memorialsWithoutAudit = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT m.id 
      FROM memorials m
      LEFT JOIN audit_events ae ON ae."entityId" = m.id 
        AND ae."entityType" = 'MEMORIAL' 
        AND ae.action = 'CREATE'
      WHERE ae.id IS NULL
    `;

    if (memorialsWithoutAudit.length > 0) {
      return {
        status: 'FAIL',
        message: 'Memorials found without creation audit',
        details: {
          count: memorialsWithoutAudit.length,
          ids: memorialsWithoutAudit.map(m => m.id),
        },
      };
    }

    // Check for orphaned audit events
    const orphanedAudits = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM audit_events ae
      WHERE ae."entityType" = 'MEMORIAL'
        AND NOT EXISTS (SELECT 1 FROM memorials m WHERE m.id = ae."entityId")
    `;

    const orphanCount = Number(orphanedAudits[0].count);
    if (orphanCount > 0) {
      return {
        status: 'WARNING',
        message: 'Orphaned audit events detected',
        details: { count: orphanCount },
      };
    }

    return {
      status: 'PASS',
      message: 'Audit trail integrity verified',
    };
  } catch (error: any) {
    return {
      status: 'FAIL',
      message: 'Audit trail check failed',
      details: error.message,
    };
  }
}

async function checkImmutabilityEnforcement(): Promise<HealthCheck> {
  try {
    const integrityReport = await runIntegrityCheck();

    if (integrityReport.corruptedCount > 0) {
      return {
        status: 'FAIL',
        message: 'Content integrity violations detected',
        details: {
          corruptedCount: integrityReport.corruptedCount,
          corrupted: integrityReport.corrupted,
        },
      };
    }

    // Check trigger existence
    const triggers = await prisma.$queryRaw<Array<{ trigger_name: string }>>`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_schema = current_schema()
        AND trigger_name IN (
          'trigger_prevent_memorial_delete',
          'trigger_prevent_memory_delete',
          'trigger_prevent_sealed_memorial_update',
          'trigger_prevent_sealed_memory_update'
        )
    `;

    if (triggers.length < 4) {
      return {
        status: 'FAIL',
        message: 'Missing immutability triggers',
        details: {
          expected: 4,
          found: triggers.length,
          existing: triggers.map(t => t.trigger_name),
        },
      };
    }

    return {
      status: 'PASS',
      message: 'Immutability enforcement active',
      details: {
        checked: integrityReport.totalChecked,
        corrupted: 0,
      },
    };
  } catch (error: any) {
    return {
      status: 'FAIL',
      message: 'Immutability check failed',
      details: error.message,
    };
  }
}

async function checkDeleteProtection(): Promise<HealthCheck> {
  try {
    // Verify delete triggers exist
    const deleteTriggers = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM information_schema.triggers 
      WHERE trigger_schema = current_schema()
        AND trigger_name LIKE 'trigger_prevent_%_delete'
    `;

    const triggerCount = Number(deleteTriggers[0].count);
    if (triggerCount < 2) {
      return {
        status: 'FAIL',
        message: 'Delete protection triggers missing',
        details: { expected: 2, found: triggerCount },
      };
    }

    return {
      status: 'PASS',
      message: 'Delete protection active',
    };
  } catch (error: any) {
    return {
      status: 'FAIL',
      message: 'Delete protection check failed',
      details: error.message,
    };
  }
}

async function collectSystemMetrics() {
  const [
    totalMemorials,
    totalMemories,
    totalAuditEvents,
    sealedMemorials,
    sealedMemories,
  ] = await Promise.all([
    prisma.memorial.count(),
    prisma.memory.count(),
    prisma.auditEvent.count(),
    prisma.memorial.count({ where: { sealed: true } }),
    prisma.memory.count({ where: { sealed: true } }),
  ]);

  return {
    totalMemorials,
    totalMemories,
    totalAuditEvents,
    sealedMemorials,
    sealedMemories,
  };
}