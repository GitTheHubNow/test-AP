// lib/billing/usage.ts
//
// The usage ledger. Every billable action calls recordUsage() — ideally
// INSIDE the same prisma.$transaction as the action itself, so a memorial
// can never exist without its billing record (or vice versa).
//
// This file is the only place that writes usage_events. Statements
// (lib/billing/statements.ts) are generated from what is recorded here.

import type { Prisma, PrismaClient, UsageEventType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrgRates, priceForEvent } from '@/lib/billing/pricing';
import { periodBounds } from '@/lib/billing/period';

type Db = PrismaClient | Prisma.TransactionClient;

export interface RecordUsageInput {
  organisationId: string;
  type:           UsageEventType;
  memorialId:     string;
  memorialTitle:  string;
  /** Defaults to now. Backfills pass the memorial's real creation time. */
  at?:            Date;
  /** Overrides the automatic note (e.g. "Backfilled"). */
  note?:          string;
}

export interface RecordUsageResult {
  /** false when this memorial was already recorded for this event type. */
  recorded:       boolean;
  unitPriceCents: number;
}

/**
 * Records one billable event. IDEMPOTENT: the (type, memorialId) unique
 * constraint means calling this twice for the same memorial records it
 * once — retries and double-submits cannot double-bill a site.
 *
 * The price is looked up and frozen here, at the moment of the event, from
 * the org's rates and trial state. Changing a rate later never rewrites
 * history.
 *
 * Pass the transaction client as `db` to make the record atomic with the
 * action being billed.
 */
export async function recordUsage(db: Db, input: RecordUsageInput): Promise<RecordUsageResult> {
  const org = await db.organisation.findUnique({
    where:  { id: input.organisationId },
    select: { trialEndsAt: true, customBaseFeeCents: true, customMemorialFeeCents: true },
  });
  if (!org) throw new Error(`recordUsage: organisation ${input.organisationId} not found`);

  const at    = input.at ?? new Date();
  const rates = getOrgRates(org);
  const price = priceForEvent(input.type, rates, org.trialEndsAt, at);

  // createMany + skipDuplicates compiles to INSERT … ON CONFLICT DO NOTHING.
  // A plain create() that hit the unique constraint would abort the whole
  // surrounding Postgres transaction, taking the memorial down with it.
  const result = await db.usageEvent.createMany({
    data: [{
      organisationId: input.organisationId,
      type:           input.type,
      memorialId:     input.memorialId,
      memorialTitle:  input.memorialTitle,
      unitPriceCents: price.unitPriceCents,
      note:           input.note ?? price.note,
      occurredAt:     at,
    }],
    skipDuplicates: true,
  });

  return { recorded: result.count === 1, unitPriceCents: price.unitPriceCents };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface UsageItem {
  id:             string;
  type:           UsageEventType;
  memorialId:     string;
  memorialTitle:  string;
  unitPriceCents: number;
  note:           string | null;
  occurredAt:     string;
  voided:         boolean;
  statementId:    string | null;
}

export interface PeriodUsage {
  periodKey: string;
  start:     string;
  end:       string;
  items:     UsageItem[];
  totals: {
    memorialCount: number;
    videoCount:    number;
    usageCents:    number;
  };
}

/** Per-memorial usage for one site and one billing month, oldest first. */
export async function getPeriodUsage(organisationId: string, periodKey: string): Promise<PeriodUsage> {
  const { start, end } = periodBounds(periodKey);

  const events = await prisma.usageEvent.findMany({
    where:   { organisationId, occurredAt: { gte: start, lt: end } },
    orderBy: { occurredAt: 'asc' },
  });

  const live = events.filter((e) => !e.voidedAt);

  return {
    periodKey,
    start: start.toISOString(),
    end:   end.toISOString(),
    items: events.map((e) => ({
      id:             e.id,
      type:           e.type,
      memorialId:     e.memorialId,
      memorialTitle:  e.memorialTitle,
      unitPriceCents: e.unitPriceCents,
      note:           e.note,
      occurredAt:     e.occurredAt.toISOString(),
      voided:         !!e.voidedAt,
      statementId:    e.statementId,
    })),
    totals: {
      memorialCount: live.filter((e) => e.type === 'MEMORIAL_CREATED').length,
      videoCount:    live.filter((e) => e.type === 'TRIBUTE_VIDEO_RENDERED').length,
      usageCents:    live.reduce((sum, e) => sum + e.unitPriceCents, 0),
    },
  };
}

export interface SiteUsageSummary {
  organisationId: string;
  name:           string;
  memorialCount:  number;
  videoCount:     number;
  usageCents:     number;
}

/** Every site's usage for one billing month — the platform-admin overview. */
export async function getPlatformUsage(periodKey: string): Promise<SiteUsageSummary[]> {
  const { start, end } = periodBounds(periodKey);

  const groups = await prisma.usageEvent.groupBy({
    by:    ['organisationId', 'type'],
    where: { occurredAt: { gte: start, lt: end }, voidedAt: null },
    _count: { _all: true },
    _sum:   { unitPriceCents: true },
  });

  const orgIds = [...new Set(groups.map((g) => g.organisationId))];
  const orgs   = await prisma.organisation.findMany({
    where:  { id: { in: orgIds } },
    select: { id: true, name: true, brandName: true },
  });
  const nameOf = new Map(orgs.map((o) => [o.id, o.brandName ?? o.name]));

  const byOrg = new Map<string, SiteUsageSummary>();
  for (const g of groups) {
    const row = byOrg.get(g.organisationId) ?? {
      organisationId: g.organisationId,
      name:           nameOf.get(g.organisationId) ?? g.organisationId,
      memorialCount:  0,
      videoCount:     0,
      usageCents:     0,
    };
    if (g.type === 'MEMORIAL_CREATED')       row.memorialCount += g._count._all;
    if (g.type === 'TRIBUTE_VIDEO_RENDERED') row.videoCount    += g._count._all;
    row.usageCents += g._sum.unitPriceCents ?? 0;
    byOrg.set(g.organisationId, row);
  }

  return [...byOrg.values()].sort((a, b) => b.usageCents - a.usageCents || a.name.localeCompare(b.name));
}
