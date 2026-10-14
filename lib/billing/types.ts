// lib/billing/types.ts — shared billing types (no runtime code).

import type { UsageEventType } from '@prisma/client';

/** One line on a statement. Stored as JSON on BillingStatement.lineItems. */
export interface StatementLine {
  kind:        'BASE_FEE' | 'USAGE';
  description: string;
  /** Present for USAGE lines — lets a line be traced to a memorial. */
  memorialId?: string;
  eventType?:  UsageEventType;
  occurredAt?: string; // ISO
  quantity:    number;
  unitCents:   number;
  amountCents: number;
  note?:       string | null;
}
