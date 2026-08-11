import { JobExecutor, JobType } from '@/lib/jobs';

/**
 * Cron job scheduler for production.
 * Configure with your preferred job scheduler (cron, AWS EventBridge, etc.)
 */

export interface CronSchedule {
  jobType: JobType;
  schedule: string; // Cron expression
  description: string;
}

export const CRON_SCHEDULES: CronSchedule[] = [
  {
    jobType: JobType.INTEGRITY_CHECK,
    schedule: '0 2 * * *', // Daily at 2 AM
    description: 'Daily integrity verification',
  },
  {
    jobType: JobType.AUDIT_CLEANUP,
    schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
    description: 'Weekly audit event cleanup',
  },
  {
    jobType: JobType.AUTO_SEAL,
    schedule: '0 4 * * *', // Daily at 4 AM
    description: 'Auto-seal approved memories',
  },
  {
    jobType: JobType.COMPLIANCE_EXPORT,
    schedule: '0 5 1 * *', // Monthly on 1st at 5 AM
    description: 'Monthly compliance report',
  },
];

/**
 * Execute a scheduled job.
 * Called by cron scheduler.
 */
export async function executeScheduledJob(jobType: JobType) {
  console.log(`[Cron] Executing scheduled job: ${jobType}`);
  
  const executor = new JobExecutor();
  const result = await executor.executeJob(jobType);
  
  if (!result.success) {
    console.error(`[Cron] Job failed: ${jobType}`, result.error);
    // TODO: Send alert to administrators
  }
  
  return result;
}

/**
 * Run all due jobs.
 * Called by external scheduler.
 */
export async function runDueJobs() {
  const executor = new JobExecutor();
  const results = [];
  
  // In production, this would be called by cron based on schedules
  // For now, just run integrity check as example
  const integrityResult = await executor.executeJob(JobType.INTEGRITY_CHECK);
  results.push(integrityResult);
  
  return results;
}