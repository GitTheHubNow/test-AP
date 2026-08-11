/**
 * lib/email-templates/automation-emails.ts
 *
 * Email templates for Phase 10 automation jobs.
 * All return HTML strings compatible with the existing sendEmailAsync helper.
 */

// ── Shared styles ──────────────────────────────────────────────────────────

const base = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9f6f2;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6f2;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.07);">
          <!-- Top bar -->
          <tr><td style="height:4px;background:#7c6d5a;"></td></tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 44px 36px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 44px 28px;border-top:1px solid #f0ece6;">
              <p style="margin:0;font-size:11px;color:#b0a898;text-align:center;letter-spacing:0.08em;text-transform:uppercase;">
                A place to remember &middot; Memorial Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const h1 = (text: string) =>
  `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1714;letter-spacing:-0.01em;">${text}</h1>`;

const subheading = (text: string) =>
  `<p style="margin:0 0 28px;font-size:13px;color:#7c6d5a;letter-spacing:0.06em;text-transform:uppercase;">${text}</p>`;

const body = (text: string) =>
  `<p style="margin:0 0 20px;font-size:15px;color:#4a4540;line-height:1.75;">${text}</p>`;

const cta = (href: string, label: string) => `
  <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr>
      <td style="background:#7c6d5a;border-radius:8px;">
        <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Georgia,serif;letter-spacing:0.02em;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

const divider = () =>
  `<hr style="border:none;border-top:1px solid #f0ece6;margin:24px 0;" />`;

const small = (text: string) =>
  `<p style="margin:0;font-size:12px;color:#b0a898;line-height:1.6;">${text}</p>`;

// ── Template 1: sendAfterDays — nominated recipient ────────────────────────

export interface SendAfterDaysEmailParams {
  memorialTitle:  string;
  publicUrl:      string;
  qrCodeDataUrl?: string;
  ownerName?:     string;
}

export function renderSendAfterDaysEmail({
  memorialTitle,
  publicUrl,
  qrCodeDataUrl,
  ownerName,
}: SendAfterDaysEmailParams): string {
  const qrBlock = qrCodeDataUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <img src="${qrCodeDataUrl}" width="180" height="180" alt="QR Code" style="border-radius:8px;border:1px solid #ece8e3;" />
        <p style="margin:10px 0 0;font-size:12px;color:#b0a898;">Scan to visit the memorial</p>
       </div>`
    : '';

  return base(`
    ${h1(`In Loving Memory of ${memorialTitle}`)}
    ${subheading('A memorial has been shared with you')}
    ${body(`${ownerName ? `${ownerName} has` : 'Someone has'} created a digital memorial page for <strong>${memorialTitle}</strong>. This page is a place to remember, share memories, and honour their life.`)}
    ${body('You can visit the memorial at any time using the link below, or by scanning the QR code.')}
    ${cta(publicUrl, 'Visit the Memorial →')}
    ${qrBlock}
    ${divider()}
    ${small(`This memorial was shared with you automatically. If you have any questions, please contact the person who created it.`)}
    ${small(`Memorial link: <a href="${publicUrl}" style="color:#7c6d5a;">${publicUrl}</a>`)}
  `);
}

// ── Template 2: Expiry warning — sent to owner 5 years before expiresAt ───

export interface ExpiryWarningEmailParams {
  memorialTitle:  string;
  ownerEmail:     string;
  expiresAt:      Date;
  renewUrl:       string;
  yearsRemaining: number;
}

export function renderExpiryWarningEmail({
  memorialTitle,
  expiresAt,
  renewUrl,
  yearsRemaining,
}: ExpiryWarningEmailParams): string {
  const expiryFormatted = expiresAt.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return base(`
    ${h1(`Your memorial will expire in ${yearsRemaining} ${yearsRemaining === 1 ? 'year' : 'years'}`)}
    ${subheading('Action required to keep this memorial online')}
    ${body(`The memorial for <strong>${memorialTitle}</strong> is scheduled to expire on <strong>${expiryFormatted}</strong>.`)}
    ${body(`After this date, the public memorial page will go offline and visitors will no longer be able to view it. To keep the memorial online, you can renew the 25-year storage from your dashboard.`)}
    ${cta(renewUrl, 'Renew Memorial Storage →')}
    ${divider()}
    ${small(`Expiry date: ${expiryFormatted}`)}
    ${small(`If you no longer wish to maintain this memorial, no action is needed — it will be suspended automatically on the expiry date. Content will not be deleted and can be restored within 90 days of expiry.`)}
  `);
}

// ── Template 3: Memorial suspended — sent to owner on expiry ──────────────

export interface MemorialSuspendedEmailParams {
  memorialTitle: string;
  renewUrl:      string;
  expiresAt:     Date;
}

export function renderMemorialSuspendedEmail({
  memorialTitle,
  renewUrl,
  expiresAt,
}: MemorialSuspendedEmailParams): string {
  const expiryFormatted = expiresAt.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return base(`
    ${h1(`Memorial suspended — ${memorialTitle}`)}
    ${subheading('Storage period has ended')}
    ${body(`The 25-year storage period for the memorial of <strong>${memorialTitle}</strong> ended on <strong>${expiryFormatted}</strong>. The public memorial page is now offline.`)}
    ${body('You can restore the memorial at any time within 90 days by renewing storage from your dashboard.')}
    ${cta(renewUrl, 'Restore Memorial →')}
    ${divider()}
    ${small('After 90 days, the memorial and all associated content will be permanently deleted.')}
  `);
}

// ── Template 4: Stale memories — sent to owner ────────────────────────────

export interface StalePendingEmailParams {
  memorialTitle:  string;
  staleCount:     number;
  moderationUrl:  string;
}

export function renderStalePendingEmail({
  memorialTitle,
  staleCount,
  moderationUrl,
}: StalePendingEmailParams): string {
  return base(`
    ${h1(`${staleCount} ${staleCount === 1 ? 'memory needs' : 'memories need'} your attention`)}
    ${subheading(memorialTitle)}
    ${body(`You have <strong>${staleCount} ${staleCount === 1 ? 'memory' : 'memories'}</strong> that ${staleCount === 1 ? 'has' : 'have'} been waiting for review for more than 30 days on the memorial for <strong>${memorialTitle}</strong>.`)}
    ${body('These memories are still waiting to be approved or rejected. Visitors who submitted them may be wondering if their message was received.')}
    ${cta(moderationUrl, 'Review Pending Memories →')}
    ${divider()}
    ${small('You can approve, reject, or keep memories pending from your dashboard. Memories will not be auto-rejected.')}
  `);
}
