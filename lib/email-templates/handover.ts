// lib/email/templates/handover.ts
//
// Two missing handover email templates:
//   renderHandoverInitiatedEmail  — sent to family when funeral home initiates handover
//   renderHandoverAcceptedFHEmail — sent to funeral home when family accepts
//   renderHandoverAcceptedFamEmail — sent to family confirming they now own the memorial
//
// Style: matches automation-emails.ts (Georgia serif, warm cream palette).

import { escapeHtml } from '@/lib/htmlEscape';

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
          <tr><td style="height:4px;background:#cdba93;"></td></tr>
          <tr>
            <td style="padding:40px 44px 36px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 44px 28px;border-top:1px solid #f0ece6;">
              <p style="margin:0;font-size:11px;color:#b0a898;text-align:center;letter-spacing:0.08em;text-transform:uppercase;">
                Absolute Posterity &middot; Memorial Platform
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

const h1 = (t: string) =>
  `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1714;letter-spacing:-0.01em;">${t}</h1>`;

const sub = (t: string) =>
  `<p style="margin:0 0 28px;font-size:13px;color:#7c6d5a;letter-spacing:0.06em;text-transform:uppercase;">${t}</p>`;

const body = (t: string) =>
  `<p style="margin:0 0 20px;font-size:15px;color:#4a4540;line-height:1.75;">${t}</p>`;

const cta = (href: string, label: string) => `
  <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr>
      <td style="background:#cdba93;border-radius:8px;">
        <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Georgia,serif;letter-spacing:0.02em;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

const divider = () =>
  `<hr style="border:none;border-top:1px solid #f0ece6;margin:24px 0;" />`;

const small = (t: string) =>
  `<p style="margin:0 0 8px;font-size:12px;color:#b0a898;line-height:1.6;">${t}</p>`;

// ── Template 1: Handover initiated → family ───────────────────────────────────

export interface HandoverInitiatedEmailParams {
  memorialTitle:      string;
  familyContactName:  string;
  funeralHomeName:    string;
  acceptUrl:          string;
  expiresAt:          Date;
}

export function renderHandoverInitiatedEmail({
  memorialTitle,
  familyContactName,
  funeralHomeName,
  acceptUrl,
  expiresAt,
}: HandoverInitiatedEmailParams): string {
  // Escape free-text values before interpolation — see lib/htmlEscape.ts.
  // familyContactName in particular now also comes from
  // Memorial.nominatedName (auto-handover — lib/jobs/job-auto-handover.ts),
  // a free-text field with no format validation.
  memorialTitle     = escapeHtml(memorialTitle);
  familyContactName = escapeHtml(familyContactName);
  funeralHomeName   = escapeHtml(funeralHomeName);
  acceptUrl         = escapeHtml(acceptUrl);

  const expiry = expiresAt.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return base(`
    ${h1(`You've been invited to manage a memorial`)}
    ${sub(`In memory of ${memorialTitle}`)}
    ${body(`Dear ${familyContactName},`)}
    ${body(`<strong>${funeralHomeName}</strong> has created a digital memorial for <strong>${memorialTitle}</strong> and is transferring ownership to you.`)}
    ${body(`As the memorial owner, you'll be able to manage photos, approve memories shared by family and friends, and keep the page updated for years to come.`)}
    ${cta(acceptUrl, 'Accept Memorial Ownership →')}
    ${divider()}
    ${small(`This invitation expires on ${expiry}.`)}
    ${small(`If you weren't expecting this or don't wish to accept, you can safely ignore this email. The memorial will remain with ${funeralHomeName}.`)}
    ${small(`Accept link: <a href="${acceptUrl}" style="color:#7c6d5a;">${acceptUrl}</a>`)}
  `);
}

// ── Template 2: Handover accepted → funeral home ──────────────────────────────

export interface HandoverAcceptedFHEmailParams {
  memorialTitle:     string;
  familyContactName: string;
  familyEmail:       string;
  acceptedAt:        Date;
  dashboardUrl:      string;
}

export function renderHandoverAcceptedFHEmail({
  memorialTitle,
  familyContactName,
  familyEmail,
  acceptedAt,
  dashboardUrl,
}: HandoverAcceptedFHEmailParams): string {
  memorialTitle     = escapeHtml(memorialTitle);
  familyContactName = escapeHtml(familyContactName);
  familyEmail       = escapeHtml(familyEmail);
  dashboardUrl      = escapeHtml(dashboardUrl);

  const when = acceptedAt.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return base(`
    ${h1(`Memorial ownership transferred`)}
    ${sub(memorialTitle)}
    ${body(`The handover for <strong>${memorialTitle}</strong> has been accepted by the family.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background:#f9f6f2;border-radius:8px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:13px;color:#7c6d5a;text-transform:uppercase;letter-spacing:0.06em;">New owner</p>
          <p style="margin:0;font-size:15px;color:#1a1714;font-weight:600;">${familyContactName}</p>
          <p style="margin:2px 0 0;font-size:13px;color:#7c6d5a;">${familyEmail}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#b0a898;">Accepted ${when}</p>
        </td>
      </tr>
    </table>
    ${body(`Your access to this memorial's dashboard has ended. The family now has full control.`)}
    ${cta(dashboardUrl, 'View Your Memorials →')}
    ${divider()}
    ${small(`If you have questions about this handover, contact the family directly at ${familyEmail}.`)}
  `);
}

// ── Template 3: Handover accepted → family (confirmation) ────────────────────

export interface HandoverAcceptedFamEmailParams {
  memorialTitle:     string;
  familyContactName: string;
  memorialUrl:       string;
  dashboardUrl:      string;
}

export function renderHandoverAcceptedFamEmail({
  memorialTitle,
  familyContactName,
  memorialUrl,
  dashboardUrl,
}: HandoverAcceptedFamEmailParams): string {
  memorialTitle     = escapeHtml(memorialTitle);
  familyContactName = escapeHtml(familyContactName);
  memorialUrl       = escapeHtml(memorialUrl);
  dashboardUrl      = escapeHtml(dashboardUrl);

  return base(`
    ${h1(`You now own this memorial`)}
    ${sub(`In memory of ${memorialTitle}`)}
    ${body(`Dear ${familyContactName},`)}
    ${body(`You've successfully accepted ownership of the memorial for <strong>${memorialTitle}</strong>. This memorial now belongs to you.`)}
    ${body(`You can manage photos, approve memories from friends and family, and update the page at any time from your dashboard.`)}
    <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background:#cdba93;border-radius:8px;margin-right:8px;">
          <a href="${dashboardUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Georgia,serif;">
            Go to Dashboard →
          </a>
        </td>
      </tr>
    </table>
    ${divider()}
    ${small(`Memorial page: <a href="${memorialUrl}" style="color:#7c6d5a;">${memorialUrl}</a>`)}
    ${small(`This memorial will be preserved for 25 years. You can renew storage from your dashboard settings.`)}
  `);
}
