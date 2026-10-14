# Billing (manual, invoice-based)

Stripe has been removed. Each site (organisation) is billed monthly by emailed
statement; you record payment by hand.

## How it works

1. **Every billable action writes one row to `usage_events`** (the ledger),
   inside the same DB transaction as the action:
   - memorial created → `MEMORIAL_CREATED` ($199 default)
   - tribute video rendered → `TRIBUTE_VIDEO_RENDERED` (tracked, $0)
   The price is frozen on the row at that moment. A unique key on
   `(type, memorialId)` means a memorial can never be billed twice.
2. **Month end** (`/api/cron/billing`, 1st of each month) builds a `DRAFT`
   statement per site from the ledger: $99 platform fee + each memorial as its
   own line. Months are cut in `BILLING_TIMEZONE` (default Australia/Sydney).
3. **You review and send** at `/dashboard/system/billing` → statement is emailed
   with your payment instructions → status `SENT`.
4. **Mark paid** when the money arrives. **Void** releases the usage so the
   month can be regenerated.

Free trial (`PlatformSettings.trialDays`, stamped on the org at creation):
usage is recorded at $0 and no platform fee is charged while in trial. A site
whose trial ends mid-month pays that whole month's platform fee.

## Routes

| Route | Who | Purpose |
|---|---|---|
| `GET /api/billing/status` | any member | standing, rates, how to pay, running total |
| `GET /api/billing/usage?period=YYYY-MM` | owner/admin | per-memorial usage for the site |
| `GET /api/billing/statements` | owner/admin | statements sent to the site |
| `GET /api/system/billing/usage?period=` | platform admin | all sites for a month |
| `GET/POST /api/system/billing/statements` | platform admin | list / generate drafts |
| `POST .../statements/[id]/send` | platform admin | email the statement |
| `PATCH .../statements/[id]` | platform admin | `mark_paid` / `void` |
| `PATCH /api/system/billing/orgs/[orgId]` | platform admin | billing email, custom rates, suspend |
| `GET /api/cron/billing` | cron | generate (and optionally send) last month's drafts |

## Config

`BILLING_PAYMENT_INSTRUCTIONS` (required to send), `BILLING_DUE_DAYS`,
`BILLING_TIMEZONE`, `BILLING_AUTO_SEND` — see `env.example`.

## Deploying this change

1. Run `npx tsx scripts/backfill-usage-events.ts --since=YYYY-MM-DD` (dry run)
   for any memorials Stripe never billed, then again with `--apply`.
2. `npx prisma migrate deploy` applies two migrations:
   `…_manual_billing_ledger` (additive) and `…_drop_stripe` (**destructive**;
   export any Stripe IDs you want to keep first).
3. Remove the `STRIPE_*` env vars from Vercel, set `BILLING_PAYMENT_INSTRUCTIONS`.
