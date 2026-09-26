// lib/billing/format.ts
//
// Pure formatting helpers for customer-facing billing text. Extracted out
// of app/api/billing/webhook/route.ts's handlePaymentFailed() specifically
// so this logic can be unit tested without importing a Next.js route
// handler (which pulls in raw request-body reading, Stripe signature
// verification, etc.) — see lib/billing/__tests__/format.test.ts.

/**
 * Formats a Stripe invoice's amount_due (an integer in the currency's
 * smallest unit — cents for AUD) into a customer-facing string like
 * "$298.00 AUD". Returns undefined if amountDueCents isn't a valid number,
 * so the caller can fall back to the generic "your payment was declined"
 * copy in the email template rather than showing a broken figure.
 */
export function formatAmountDue(amountDueCents: unknown, currency: unknown): string | undefined {
  if (typeof amountDueCents !== 'number' || !Number.isFinite(amountDueCents)) return undefined;

  const currencyCode = typeof currency === 'string' && currency.length === 3
    ? currency.toUpperCase()
    : 'AUD';

  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: currencyCode,
  }).format(amountDueCents / 100);
}

/**
 * Formats a Stripe invoice's next_payment_attempt (a Unix seconds
 * timestamp, present only when Stripe has actually scheduled a dunning
 * retry) into a customer-facing date string like "18 September 2026".
 * Returns undefined if no retry is scheduled, so the email can say so
 * explicitly rather than inventing a date.
 *
 * Timezone is pinned explicitly to Australia/Sydney — without it, the
 * displayed date depends on whatever timezone the server process
 * happens to run in, which could show a different calendar date in
 * production than in local testing for the exact same input.
 */
export function formatRetryDate(nextPaymentAttemptSeconds: unknown): string | undefined {
  if (typeof nextPaymentAttemptSeconds !== 'number' || !Number.isFinite(nextPaymentAttemptSeconds)) {
    return undefined;
  }

  return new Date(nextPaymentAttemptSeconds * 1000).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}
