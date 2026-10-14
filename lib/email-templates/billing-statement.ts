/**
 * lib/email-templates/billing-statement.ts
 *
 * The monthly bill emailed to a site. Replaces the Stripe invoice email.
 * Self-contained (same visual style as the other templates in this folder).
 * Every interpolated value is escaped — memorial titles are free text.
 */

import { escapeHtml } from '@/lib/htmlEscape';
import { formatMoney } from '@/lib/billing/pricing';
import type { StatementLine } from '@/lib/billing/types';

export interface StatementEmailParams {
  orgName:             string;
  number:              string;
  periodLabel:         string;   // "September 2026"
  currency:            string;
  lines:               StatementLine[];
  baseFeeCents:        number;
  usageCents:          number;
  totalCents:          number;
  dueDateLabel:        string;   // "28 October 2026"
  paymentInstructions: string;   // plain text; newlines preserved
  billingUrl:          string;
}

const td = 'padding:8px 0;border-bottom:1px solid #f0ece6;font-size:13px;color:#4a4540;vertical-align:top;';

export function statementEmailSubject(p: { number: string; periodLabel: string; orgName: string }): string {
  return `Statement ${p.number} — ${p.periodLabel} (${p.orgName})`;
}

export function renderStatementEmail(p: StatementEmailParams): string {
  const rows = p.lines.map((l) => {
    const note = l.note ? `<div style="font-size:11px;color:#b0a898;margin-top:2px;">${escapeHtml(l.note)}</div>` : '';
    const when = l.occurredAt
      ? `<div style="font-size:11px;color:#b0a898;margin-top:2px;">${escapeHtml(new Date(l.occurredAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }))}</div>`
      : '';
    return `<tr>
      <td style="${td}">${escapeHtml(l.description)}${when}${note}</td>
      <td style="${td}text-align:right;white-space:nowrap;">${escapeHtml(formatMoney(l.amountCents, p.currency))}</td>
    </tr>`;
  }).join('');

  const instructions = escapeHtml(p.paymentInstructions).replace(/\n/g, '<br />');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9f6f2;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.07);">
        <tr><td style="height:4px;background:#7c6d5a;"></td></tr>
        <tr><td style="padding:40px 44px 32px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1714;">Statement ${escapeHtml(p.number)}</h1>
          <p style="margin:0 0 28px;font-size:13px;color:#7c6d5a;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(p.periodLabel)} &middot; ${escapeHtml(p.orgName)}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
            <tr>
              <td style="padding:0 0 8px;border-bottom:2px solid #1a1714;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7c6d5a;">Description</td>
              <td style="padding:0 0 8px;border-bottom:2px solid #1a1714;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7c6d5a;text-align:right;">Amount</td>
            </tr>
            ${rows}
            <tr>
              <td style="padding:14px 0 0;font-size:16px;font-weight:700;color:#1a1714;">Total due (${escapeHtml(p.currency)})</td>
              <td style="padding:14px 0 0;font-size:16px;font-weight:700;color:#1a1714;text-align:right;">${escapeHtml(formatMoney(p.totalCents, p.currency))}</td>
            </tr>
          </table>

          <p style="margin:24px 0 8px;font-size:15px;color:#4a4540;line-height:1.75;">Payment is due by <strong>${escapeHtml(p.dueDateLabel)}</strong>.</p>
          <div style="margin:0 0 24px;padding:16px 18px;background:#f9f6f2;border-radius:8px;font-size:14px;color:#4a4540;line-height:1.7;">
            <strong>How to pay</strong><br />${instructions}<br />
            <span style="color:#7c6d5a;">Please use <strong>${escapeHtml(p.number)}</strong> as the payment reference.</span>
          </div>

          <p style="margin:0;font-size:13px;color:#7c6d5a;line-height:1.6;">
            You can see exactly which memorials make up this statement at
            <a href="${escapeHtml(p.billingUrl)}" style="color:#7c6d5a;">${escapeHtml(p.billingUrl)}</a>.
            If anything looks wrong, just reply to this email.
          </p>
        </td></tr>
        <tr><td style="padding:20px 44px 28px;border-top:1px solid #f0ece6;">
          <p style="margin:0;font-size:11px;color:#b0a898;text-align:center;letter-spacing:0.08em;text-transform:uppercase;">A place to remember &middot; Memorial Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
