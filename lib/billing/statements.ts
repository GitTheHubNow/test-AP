// lib/billing/statements.ts
//
// Monthly statements, generated from the usage ledger and emailed to each
// site. Lifecycle:
//
//   generate ──► DRAFT ──► send ──► SENT ──► mark paid ──► PAID
//                  │                  │
//                  └──── void ◄───────┘      (VOID releases its usage events)
//
// A DRAFT can be regenerated freely (e.g. after voiding a mistaken event).
// SENT and PAID statements are never modified by generation — what you
// emailed is what stays on record.

import { Prisma } from '@prisma/client';
import type { BillingStatement } from '@prisma/client';
import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getAppUrl } from '@/lib/email';
import { renderStatementEmail, statementEmailSubject } from '@/lib/email-templates/billing-statement';
import { CURRENCY, baseFeeApplies, getOrgRates, formatMoney } from '@/lib/billing/pricing';
import { buildStatement, statementNumber } from '@/lib/billing/build';
import { formatPeriodLabel, isPeriodClosed, periodBounds } from '@/lib/billing/period';
import type { StatementLine } from '@/lib/billing/types';

export { buildStatement, statementNumber } from '@/lib/billing/build';
export type { BuildInputEvent, BuiltStatement } from '@/lib/billing/build';

// ── Generate ─────────────────────────────────────────────────────────────────

export type SkipReason = 'PERIOD_OPEN' | 'ALREADY_ISSUED' | 'NOTHING_TO_BILL';

export type GenerateOutcome =
  | { outcome: 'created' | 'regenerated'; statement: BillingStatement }
  | { outcome: 'skipped'; reason: SkipReason; statement?: BillingStatement };

export async function generateStatement(
  organisationId: string,
  periodKey: string,
  opts: { now?: Date; allowOpenPeriod?: boolean } = {},
): Promise<GenerateOutcome> {
  const now = opts.now ?? new Date();

  // Only closed months are billed — otherwise a statement generated on the
  // 20th would silently miss everything created on the 21st–31st.
  if (!opts.allowOpenPeriod && !isPeriodClosed(periodKey, now)) {
    return { outcome: 'skipped', reason: 'PERIOD_OPEN' };
  }

  const { start, end } = periodBounds(periodKey);

  return prisma.$transaction(async (tx): Promise<GenerateOutcome> => {
    const org = await tx.organisation.findUnique({
      where:  { id: organisationId },
      select: {
        id: true, trialEndsAt: true, subscriptionStatus: true,
        customBaseFeeCents: true, customMemorialFeeCents: true,
      },
    });
    if (!org) throw new Error(`generateStatement: organisation ${organisationId} not found`);

    const existing = await tx.billingStatement.findUnique({
      where: { organisationId_periodKey: { organisationId, periodKey } },
    });

    if (existing && (existing.status === 'SENT' || existing.status === 'PAID')) {
      return { outcome: 'skipped', reason: 'ALREADY_ISSUED', statement: existing };
    }

    // Re-generating a DRAFT/VOID: release its events first so they are
    // picked up again with whatever the ledger says right now.
    if (existing) {
      await tx.usageEvent.updateMany({
        where: { statementId: existing.id },
        data:  { statementId: null },
      });
    }

    const events = await tx.usageEvent.findMany({
      where:   { organisationId, occurredAt: { gte: start, lt: end }, voidedAt: null, statementId: null },
      orderBy: { occurredAt: 'asc' },
    });

    const rates = getOrgRates(org);
    const built = buildStatement({
      periodLabel:    formatPeriodLabel(periodKey),
      includeBaseFee: baseFeeApplies(org.trialEndsAt, end, org.subscriptionStatus === 'CANCELED'),
      baseFeeCents:   rates.baseFeeCents,
      events,
    });

    // Nothing owed (e.g. the whole month was inside the free trial): do not
    // issue a $0 bill. Remove any stale draft left from an earlier run.
    if (built.totalCents <= 0) {
      if (existing) await tx.billingStatement.delete({ where: { id: existing.id } });
      return { outcome: 'skipped', reason: 'NOTHING_TO_BILL' };
    }

    const data = {
      periodStart:      start,
      periodEnd:        end,
      status:           'DRAFT' as const,
      currency:         CURRENCY,
      baseFeeCents:     built.baseFeeCents,
      usageCents:       built.usageCents,
      totalCents:       built.totalCents,
      lineItems:        built.lines as unknown as Prisma.InputJsonValue,
      sentAt:           null,
      sentTo:           [] as string[],
      dueAt:            null,
      paidAt:           null,
      paymentReference: null,
    };

    const statement = existing
      ? await tx.billingStatement.update({ where: { id: existing.id }, data })
      : await tx.billingStatement.create({
          data: { ...data, organisationId, periodKey, number: statementNumber(organisationId, periodKey) },
        });

    if (events.length > 0) {
      await tx.usageEvent.updateMany({
        where: { id: { in: events.map((e) => e.id) } },
        data:  { statementId: statement.id },
      });
    }

    return { outcome: existing ? 'regenerated' : 'created', statement };
  });
}

export interface BulkResultRow {
  organisationId: string;
  outcome:        GenerateOutcome['outcome'] | 'error';
  reason?:        SkipReason;
  statementId?:   string;
  totalCents?:    number;
  error?:         string;
}

/** Generate drafts for every site for one billing month. One site failing never stops the rest. */
export async function generateAllStatements(
  periodKey: string,
  opts: { now?: Date; allowOpenPeriod?: boolean } = {},
): Promise<BulkResultRow[]> {
  const orgs = await prisma.organisation.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  const rows: BulkResultRow[] = [];

  for (const { id } of orgs) {
    try {
      const r = await generateStatement(id, periodKey, opts);
      rows.push(
        r.outcome === 'skipped'
          ? { organisationId: id, outcome: 'skipped', reason: r.reason, statementId: r.statement?.id }
          : { organisationId: id, outcome: r.outcome, statementId: r.statement.id, totalCents: r.statement.totalCents },
      );
    } catch (err) {
      console.error(`[billing] generateStatement failed for org ${id}, period ${periodKey}:`, err);
      rows.push({ organisationId: id, outcome: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }
  return rows;
}

// ── Send ─────────────────────────────────────────────────────────────────────

/** BILLING_AUTO_SEND, case-insensitive. Anything unrecognised means OFF. */
export function isAutoSendEnabled(): boolean {
  return ['true', '1', 'yes', 'on'].includes((process.env.BILLING_AUTO_SEND ?? '').trim().toLowerCase());
}

export function getPaymentInstructions(): string {
  // Env vars are single-line; allow a literal "\n" to mean a line break.
  return (process.env.BILLING_PAYMENT_INSTRUCTIONS ?? '').replace(/\\n/g, '\n').trim();
}

function getDueDays(): number {
  const n = Number(process.env.BILLING_DUE_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 14;
}

/** billingEmail if set, otherwise every OWNER member's account email. */
export async function resolveBillingRecipients(org: { id: string; billingEmail: string | null }): Promise<string[]> {
  if (org.billingEmail) return [org.billingEmail];

  const owners = await prisma.orgMember.findMany({
    where:  { organisationId: org.id, role: 'OWNER' },
    select: { userId: true },
  });

  const clerk  = await clerkClient();
  const emails = new Set<string>();
  for (const o of owners) {
    try {
      const user  = await clerk.users.getUser(o.userId);
      const email = (user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0])?.emailAddress;
      if (email) emails.add(email);
    } catch (err) {
      console.error(`[billing] could not resolve email for owner ${o.userId}:`, err);
    }
  }
  return [...emails];
}

export type SendErrorCode =
  | 'NOT_FOUND' | 'NOT_SENDABLE' | 'ALREADY_SENT'
  | 'PAYMENT_INSTRUCTIONS_MISSING' | 'NO_RECIPIENT' | 'EMAIL_FAILED';

export type SendResult =
  | { ok: true; statement: BillingStatement; sentTo: string[] }
  | { ok: false; code: SendErrorCode; error: string };

export async function sendStatement(statementId: string, opts: { resend?: boolean } = {}): Promise<SendResult> {
  const statement = await prisma.billingStatement.findUnique({
    where:   { id: statementId },
    include: { organisation: { select: { id: true, name: true, brandName: true, billingEmail: true } } },
  });
  if (!statement) return { ok: false, code: 'NOT_FOUND', error: 'Statement not found' };

  if (statement.status === 'VOID' || statement.status === 'PAID') {
    return { ok: false, code: 'NOT_SENDABLE', error: `A ${statement.status} statement cannot be sent` };
  }
  if (statement.status === 'SENT' && !opts.resend) {
    return { ok: false, code: 'ALREADY_SENT', error: 'Statement was already sent. Pass resend to send it again.' };
  }

  // A bill with no way to pay it is worse than no bill.
  const instructions = getPaymentInstructions();
  if (!instructions) {
    return {
      ok: false, code: 'PAYMENT_INSTRUCTIONS_MISSING',
      error: 'BILLING_PAYMENT_INSTRUCTIONS is not set — set it to your bank/payment details before sending statements.',
    };
  }

  const recipients = await resolveBillingRecipients(statement.organisation);
  if (recipients.length === 0) {
    return { ok: false, code: 'NO_RECIPIENT', error: 'No billing email set and no owner email could be resolved for this site.' };
  }

  // Keep the original due date on a resend; set a fresh one on first send.
  const sentAt = new Date();
  const dueAt  = statement.status === 'SENT' && statement.dueAt
    ? statement.dueAt
    : new Date(sentAt.getTime() + getDueDays() * 24 * 60 * 60 * 1000);

  const orgName     = statement.organisation.brandName ?? statement.organisation.name;
  const periodLabel = formatPeriodLabel(statement.periodKey);
  const html = renderStatementEmail({
    orgName,
    number:              statement.number,
    periodLabel,
    currency:            statement.currency,
    lines:               statement.lineItems as unknown as StatementLine[],
    baseFeeCents:        statement.baseFeeCents,
    usageCents:          statement.usageCents,
    totalCents:          statement.totalCents,
    dueDateLabel:        dueAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    paymentInstructions: instructions,
    billingUrl:          `${getAppUrl()}/dashboard/billing`,
  });
  const subject = statementEmailSubject({ number: statement.number, periodLabel, orgName });

  const delivered: string[] = [];
  for (const to of recipients) {
    const r = await sendEmail({ to, subject, html });
    if (r.success) delivered.push(to);
    else console.error(`[billing] statement ${statement.number} email to ${to} failed: ${r.error}`);
  }

  // Only mark SENT if at least one email really went out — otherwise the
  // admin would see "sent" for a bill the customer never received.
  if (delivered.length === 0) {
    return { ok: false, code: 'EMAIL_FAILED', error: 'The email could not be delivered (check RESEND_API_KEY and the server logs).' };
  }

  const updated = await prisma.billingStatement.update({
    where: { id: statement.id },
    data:  { status: 'SENT', sentAt, sentTo: delivered, dueAt },
  });
  return { ok: true, statement: updated, sentTo: delivered };
}

export interface SendAllRow { statementId: string; number: string; ok: boolean; error?: string }

/** Email every DRAFT statement for a month. One failure never stops the rest; failed ones stay DRAFT to retry. */
export async function sendAllDrafts(periodKey: string): Promise<SendAllRow[]> {
  const drafts = await prisma.billingStatement.findMany({
    where:   { periodKey, status: 'DRAFT' },
    select:  { id: true, number: true },
    orderBy: { createdAt: 'asc' },
  });
  const rows: SendAllRow[] = [];
  for (const d of drafts) {
    const r = await sendStatement(d.id);
    rows.push(r.ok ? { statementId: d.id, number: d.number, ok: true } : { statementId: d.id, number: d.number, ok: false, error: r.error });
  }
  return rows;
}

// ── Mark paid / void ─────────────────────────────────────────────────────────

export type TransitionResult =
  | { ok: true; statement: BillingStatement }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE'; error: string };

export async function markStatementPaid(statementId: string, paymentReference?: string): Promise<TransitionResult> {
  const s = await prisma.billingStatement.findUnique({ where: { id: statementId } });
  if (!s) return { ok: false, code: 'NOT_FOUND', error: 'Statement not found' };
  if (s.status === 'VOID') return { ok: false, code: 'INVALID_STATE', error: 'A void statement cannot be marked paid' };
  if (s.status === 'PAID') return { ok: true, statement: s }; // idempotent

  const updated = await prisma.billingStatement.update({
    where: { id: s.id },
    data:  { status: 'PAID', paidAt: new Date(), paymentReference: paymentReference?.trim() || null },
  });
  return { ok: true, statement: updated };
}

export async function voidStatement(statementId: string): Promise<TransitionResult> {
  return prisma.$transaction(async (tx): Promise<TransitionResult> => {
    const s = await tx.billingStatement.findUnique({ where: { id: statementId } });
    if (!s) return { ok: false, code: 'NOT_FOUND', error: 'Statement not found' };
    if (s.status === 'PAID') return { ok: false, code: 'INVALID_STATE', error: 'A paid statement cannot be voided' };
    if (s.status === 'VOID') return { ok: true, statement: s }; // idempotent

    // Release the events so regenerating the period can bill them again.
    await tx.usageEvent.updateMany({ where: { statementId: s.id }, data: { statementId: null } });
    const updated = await tx.billingStatement.update({ where: { id: s.id }, data: { status: 'VOID' } });
    return { ok: true, statement: updated };
  });
}

// ── Serialisation (API responses) ────────────────────────────────────────────

export interface StatementDTO {
  id:               string;
  number:           string;
  periodKey:        string;
  periodLabel:      string;
  status:           BillingStatement['status'];
  currency:         string;
  baseFeeCents:     number;
  usageCents:       number;
  totalCents:       number;
  totalFormatted:   string;
  lines:            StatementLine[];
  sentAt:           string | null;
  sentTo:           string[];
  dueAt:            string | null;
  paidAt:           string | null;
  paymentReference: string | null;
  createdAt:        string;
}

export function toStatementDTO(s: BillingStatement): StatementDTO {
  return {
    id:               s.id,
    number:           s.number,
    periodKey:        s.periodKey,
    periodLabel:      formatPeriodLabel(s.periodKey),
    status:           s.status,
    currency:         s.currency,
    baseFeeCents:     s.baseFeeCents,
    usageCents:       s.usageCents,
    totalCents:       s.totalCents,
    totalFormatted:   formatMoney(s.totalCents, s.currency),
    lines:            s.lineItems as unknown as StatementLine[],
    sentAt:           s.sentAt?.toISOString() ?? null,
    sentTo:           s.sentTo,
    dueAt:            s.dueAt?.toISOString() ?? null,
    paidAt:           s.paidAt?.toISOString() ?? null,
    paymentReference: s.paymentReference,
    createdAt:        s.createdAt.toISOString(),
  };
}
