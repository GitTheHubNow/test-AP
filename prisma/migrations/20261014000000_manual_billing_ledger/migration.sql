-- Manual (invoice-based) billing: usage ledger + monthly statements.
-- ADDITIVE ONLY — safe to apply on its own. The destructive Stripe
-- removal is deliberately a separate migration (20261014000100_drop_stripe).

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('MEMORIAL_CREATED', 'TRIBUTE_VIDEO_RENDERED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID');

-- AlterTable: per-site billing settings
ALTER TABLE "organisations"
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "customBaseFeeCents" INTEGER,
  ADD COLUMN "customMemorialFeeCents" INTEGER;

-- Account standing no longer comes from Stripe webhooks. New orgs start
-- ACTIVE, and every org that was only NONE/PAST_DUE/INCOMPLETE because of
-- Stripe checkout state is released so nobody is locked out of creating
-- memorials by a payment provider that no longer exists. CANCELED orgs are
-- left as-is (reactivate individually via PATCH /api/system/billing/orgs/[orgId]).
ALTER TABLE "organisations" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'ACTIVE';
UPDATE "organisations"
   SET "subscriptionStatus" = 'ACTIVE'
 WHERE "subscriptionStatus" IN ('NONE', 'PAST_DUE', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "billing_statements" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "baseFeeCents" INTEGER NOT NULL,
    "usageCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "lineItems" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT[],
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" "UsageEventType" NOT NULL,
    "memorialId" TEXT NOT NULL,
    "memorialTitle" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "statementId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_statements_number_key" ON "billing_statements"("number");

-- CreateIndex
CREATE INDEX "billing_statements_status_idx" ON "billing_statements"("status");

-- CreateIndex
CREATE INDEX "billing_statements_periodKey_idx" ON "billing_statements"("periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "billing_statements_organisationId_periodKey_key" ON "billing_statements"("organisationId", "periodKey");

-- CreateIndex
CREATE INDEX "usage_events_organisationId_occurredAt_idx" ON "usage_events"("organisationId", "occurredAt");

-- CreateIndex
CREATE INDEX "usage_events_statementId_idx" ON "usage_events"("statementId");

-- CreateIndex: one memorial can only be billed once per event type
CREATE UNIQUE INDEX "usage_events_type_memorialId_key" ON "usage_events"("type", "memorialId");

-- AddForeignKey
ALTER TABLE "billing_statements" ADD CONSTRAINT "billing_statements_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "billing_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
