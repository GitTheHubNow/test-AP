// lib/billing/adminNotify.ts
//
// The monthly "your bills are ready" email to the platform owner(s).
// Sent by /api/cron/billing after drafts are generated, so the 1st of the
// month brings the reminder to you rather than relying on you remembering.

import { clerkClient } from '@clerk/nextjs/server';
import { sendEmail, getAppUrl } from '@/lib/email';
import { escapeHtml } from '@/lib/htmlEscape';
import { getPlatformAdminIds } from '@/lib/auth/platformAdmin';
import { formatMoney } from '@/lib/billing/pricing';
import type { ReviewSummary } from '@/lib/billing/adminSummary';

export async function notifyAdminBillsReady(s: ReviewSummary): Promise<{ sent: number }> {
  if (s.draftCount === 0) return { sent: 0 };

  const url = `${getAppUrl()}/dashboard/system/billing`;
  const subject = `${s.periodLabel} bills are ready to review (${s.draftCount} · ${formatMoney(s.draftCents)})`;
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;color:#1a1714;">
    <h2 style="margin:0 0 12px;">${escapeHtml(s.periodLabel)} bills are ready</h2>
    <p style="font-size:15px;line-height:1.6;color:#4a4540;">
      <strong>${s.draftCount}</strong> statement${s.draftCount === 1 ? '' : 's'} totalling
      <strong>${escapeHtml(formatMoney(s.draftCents))}</strong> have been drafted from last month's usage.
      Nothing has been sent to any site yet.
    </p>
    ${s.overdueCount > 0 ? `<p style="font-size:14px;color:#92400e;">${s.overdueCount} earlier statement${s.overdueCount === 1 ? ' is' : 's are'} overdue (${escapeHtml(formatMoney(s.overdueCents))}).</p>` : ''}
    <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;background:#1a1714;color:#fff;border-radius:6px;text-decoration:none;">Review &amp; send bills</a></p>
  </div>`;

  const clerk = await clerkClient();
  let sent = 0;
  for (const id of getPlatformAdminIds()) {
    try {
      const u = await clerk.users.getUser(id);
      const to = (u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0])?.emailAddress;
      if (!to) continue;
      const r = await sendEmail({ to, subject, html });
      if (r.success) sent++;
    } catch (err) {
      console.error(`[billing] could not notify admin ${id}:`, err);
    }
  }
  return { sent };
}
