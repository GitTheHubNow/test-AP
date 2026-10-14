// lib/billing/build.ts
//
// Pure statement-building functions — no database, no email, no env. Kept
// separate from statements.ts so the money arithmetic can be unit-tested
// without a database connection.

import type { UsageEventType } from '@prisma/client';
import { EVENT_LABELS } from '@/lib/billing/pricing';
import type { StatementLine } from '@/lib/billing/types';

export interface BuildInputEvent {
  type:           UsageEventType;
  memorialId:     string;
  memorialTitle:  string;
  unitPriceCents: number;
  note:           string | null;
  occurredAt:     Date;
}

export interface BuiltStatement {
  lines:        StatementLine[];
  baseFeeCents: number;
  usageCents:   number;
  totalCents:   number;
}

export function buildStatement(input: {
  periodLabel:    string;
  includeBaseFee: boolean;
  baseFeeCents:   number;
  events:         BuildInputEvent[];
}): BuiltStatement {
  const lines: StatementLine[] = [];

  const baseFee = input.includeBaseFee ? input.baseFeeCents : 0;
  if (input.includeBaseFee) {
    lines.push({
      kind:        'BASE_FEE',
      description: `Platform fee — ${input.periodLabel}`,
      quantity:    1,
      unitCents:   input.baseFeeCents,
      amountCents: input.baseFeeCents,
    });
  }

  const sorted = [...input.events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const e of sorted) {
    lines.push({
      kind:        'USAGE',
      description: `${EVENT_LABELS[e.type]} — ${e.memorialTitle}`,
      memorialId:  e.memorialId,
      eventType:   e.type,
      occurredAt:  e.occurredAt.toISOString(),
      quantity:    1,
      unitCents:   e.unitPriceCents,
      amountCents: e.unitPriceCents,
      note:        e.note,
    });
  }

  const usageCents = sorted.reduce((sum, e) => sum + e.unitPriceCents, 0);
  return { lines, baseFeeCents: baseFee, usageCents, totalCents: baseFee + usageCents };
}

export function statementNumber(organisationId: string, periodKey: string): string {
  return `AP-${periodKey.replace('-', '')}-${organisationId.slice(-8).toUpperCase()}`;
}
