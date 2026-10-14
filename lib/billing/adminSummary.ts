// lib/billing/adminSummary.ts
//
// "What needs the owner's attention?" — drives the dashboard banner and the
// monthly heads-up email. Drafts are always for the month that just closed;
// overdue covers any SENT statement past its due date, from any month.

import { prisma } from '@/lib/prisma';
import { periodKeyFor, previousPeriodKey, formatPeriodLabel } from '@/lib/billing/period';

export interface ReviewSummary {
  period:        string;
  periodLabel:   string;
  draftCount:    number;
  draftCents:    number;
  overdueCount:  number;
  overdueCents:  number;
}

export async function getReviewSummary(now: Date = new Date()): Promise<ReviewSummary> {
  const period = previousPeriodKey(periodKeyFor(now));

  const [drafts, overdue] = await Promise.all([
    prisma.billingStatement.aggregate({
      where:  { periodKey: period, status: 'DRAFT' },
      _count: { _all: true },
      _sum:   { totalCents: true },
    }),
    prisma.billingStatement.aggregate({
      where:  { status: 'SENT', dueAt: { lt: now } },
      _count: { _all: true },
      _sum:   { totalCents: true },
    }),
  ]);

  return {
    period,
    periodLabel:  formatPeriodLabel(period),
    draftCount:   drafts._count._all,
    draftCents:   drafts._sum.totalCents ?? 0,
    overdueCount: overdue._count._all,
    overdueCents: overdue._sum.totalCents ?? 0,
  };
}
