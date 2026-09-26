// lib/email/send.ts
//
// Typed send functions for every email type in the platform.
// Every function:
//   1. Calls shouldSend() — respects org preferences and batch cooldowns
//   2. Renders the template
//   3. Calls sendEmailAsync() — fire-and-forget, never blocks a request
//   4. Records batch sends where applicable
//
// Import from here, not from lib/email.ts directly, so policy is always enforced.
//
// Usage:
//   import { sendNewMemoryDigest } from '@/lib/email/send';
//   await sendNewMemoryDigest({ memorialId, memorialTitle, ownerEmail, count: 3 });

import { sendEmailAsync, getAppUrl, getModerationUrl, getMemorialUrl } from '@/lib/email';
import { shouldSend, recordBatchSent, getOrgIdForMemorial } from '@/lib/email/policy';
import { prisma } from '@/lib/prisma';
import { clerkClient } from '@clerk/nextjs/server';
import { renderNewMemoryEmail }       from '@/lib/email-templates/new-memory-email';
import { renderWelcomeEmail }         from '@/lib/email-templates/welcome-email';
import { renderStalePendingEmail }    from '@/lib/email-templates/automation-emails';
import { renderExpiryWarningEmail }   from '@/lib/email-templates/automation-emails';
import { renderMemorialSuspendedEmail } from '@/lib/email-templates/automation-emails';
import { renderLastChanceUploadEmail } from '@/lib/email-templates/automation-emails';
import { renderPublishPromptEmail }    from '@/lib/email-templates/automation-emails';
import { renderPaymentFailedEmail }    from '@/lib/email-templates/automation-emails';
import {
  renderHandoverInitiatedEmail,
  renderHandoverAcceptedFHEmail,
  renderHandoverAcceptedFamEmail,
  renderFamilyAccessGrantedEmail,
} from '@/lib/email-templates/handover';

const APP_URL = getAppUrl();

// ── 1. Welcome email (memorial created) ──────────────────────────────────────

export async function sendWelcomeEmail(params: {
  ownerEmail:    string;
  memorialId:    string;
  memorialTitle: string;
  qrCodeDataUrl: string;
  slug:          string;
  publicToken?:  string;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'WELCOME')) return;

  // FIXED: previously fell back to the retired `/m/{memorialId}` URL shape
  // when publicToken was missing, producing a dead link in the welcome
  // email. publicToken is generated lazily (see app/api/memorials/[id]/qr/
  // route.ts) — if it's not passed in yet, fall back to the dashboard QR
  // page instead of a broken public link.
  const publicUrl = params.publicToken
    ? getMemorialUrl(params.slug, params.publicToken)
    : `${APP_URL}/dashboard/memorial/${params.memorialId}/qr`;
  const dashboardUrl = `${APP_URL}/dashboard/memorial/${params.memorialId}/qr`;

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `Memorial created: ${params.memorialTitle}`,
    html:    renderWelcomeEmail({
      memorialTitle: params.memorialTitle,
      memorialId:    params.memorialId,
      publicUrl,
      qrCodeDataUrl: params.qrCodeDataUrl,
      dashboardUrl,
    }),
  });
}

// ── 2. New memory digest (batched — max 1/hour per memorial) ─────────────────
// Call this each time a memory is submitted. Policy enforces the cooldown.

export async function sendNewMemoryDigest(params: {
  ownerEmail:    string;
  memorialId:    string;
  memorialTitle: string;
  authorName:    string | null;
  excerpt:       string;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'NEW_MEMORY_DIGEST', params.memorialId)) return;

  const moderationUrl = getModerationUrl(params.memorialId);

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `New memory submitted — ${params.memorialTitle}`,
    html:    renderNewMemoryEmail({
      memorialTitle:  params.memorialTitle,
      memorialId:     params.memorialId,
      authorName:     params.authorName,
      messageExcerpt: params.excerpt,
      moderationUrl,
    }),
  });

  if (orgId) recordBatchSent(orgId, 'NEW_MEMORY_DIGEST', params.memorialId);
}

// ── 3. Upload digest (batched — max 1/hour per memorial) ─────────────────────

export async function sendUploadDigest(params: {
  ownerEmail:    string;
  memorialId:    string;
  memorialTitle: string;
  uploadCount:   number;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'UPLOAD_DIGEST', params.memorialId)) return;

  const moderationUrl = getModerationUrl(params.memorialId);
  const n = params.uploadCount;

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `${n} new ${n === 1 ? 'upload' : 'uploads'} need review — ${params.memorialTitle}`,
    html: renderNewMemoryEmail({
      // Reuse new-memory template shape — close enough for uploads
      memorialTitle:  params.memorialTitle,
      memorialId:     params.memorialId,
      authorName:     null,
      messageExcerpt: `${n} new ${n === 1 ? 'photo has' : 'photos have'} been uploaded and ${n === 1 ? 'needs' : 'need'} your review before appearing in the gallery.`,
      moderationUrl,
    }),
  });

  if (orgId) recordBatchSent(orgId, 'UPLOAD_DIGEST', params.memorialId);
}

// ── 4. Stale pending memories ─────────────────────────────────────────────────

export async function sendStalePendingEmail(params: {
  ownerEmail:    string;
  memorialId:    string;
  memorialTitle: string;
  staleCount:    number;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'STALE_PENDING', params.memorialId)) return;

  const moderationUrl = getModerationUrl(params.memorialId);

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `${params.staleCount} ${params.staleCount === 1 ? 'memory needs' : 'memories need'} attention — ${params.memorialTitle}`,
    html:    renderStalePendingEmail({
      memorialTitle:  params.memorialTitle,
      staleCount:     params.staleCount,
      moderationUrl,
    }),
  });

  if (orgId) recordBatchSent(orgId, 'STALE_PENDING', params.memorialId);
}

// ── 5. Handover initiated → family ───────────────────────────────────────────

export async function sendHandoverInitiated(params: {
  familyEmail:        string;
  familyContactName:  string;
  memorialId:         string;
  memorialTitle:      string;
  funeralHomeName:    string;
  acceptToken:        string;
  expiresAt:          Date;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'HANDOVER_INITIATED')) return;

  const acceptUrl = `${APP_URL}/handover/accept/${params.acceptToken}`;

  sendEmailAsync({
    to:      params.familyEmail,
    subject: `You've been invited to manage ${params.memorialTitle}'s memorial`,
    html:    renderHandoverInitiatedEmail({
      memorialTitle:     params.memorialTitle,
      familyContactName: params.familyContactName,
      funeralHomeName:   params.funeralHomeName,
      acceptUrl,
      expiresAt:         params.expiresAt,
    }),
  });
}

// ── 6a. Handover accepted → funeral home ─────────────────────────────────────

export async function sendHandoverAcceptedToFH(params: {
  funeralHomeEmail:  string;
  memorialId:        string;
  memorialTitle:     string;
  familyContactName: string;
  familyEmail:       string;
  acceptedAt:        Date;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'HANDOVER_ACCEPTED_FH')) return;

  const dashboardUrl = `${APP_URL}/dashboard/memorials`;

  sendEmailAsync({
    to:      params.funeralHomeEmail,
    subject: `Handover complete — ${params.memorialTitle}`,
    html:    renderHandoverAcceptedFHEmail({
      memorialTitle:     params.memorialTitle,
      familyContactName: params.familyContactName,
      familyEmail:       params.familyEmail,
      acceptedAt:        params.acceptedAt,
      dashboardUrl,
    }),
  });
}

// ── 6b. Handover accepted → family (confirmation) ────────────────────────────

export async function sendHandoverAcceptedToFamily(params: {
  familyEmail:       string;
  familyContactName: string;
  memorialId:        string;
  memorialTitle:     string;
  slug?:             string;
  publicToken?:      string;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'HANDOVER_ACCEPTED_FAM')) return;

  // FIXED: previously used a retired `qrTokenHash` param and the old
  // /m/{token} URL shape via getMemorialUrl(token). Public memorial URLs
  // now need both slug and publicToken — see app/v/[slug].
  const memorialUrl  = params.slug && params.publicToken
    ? getMemorialUrl(params.slug, params.publicToken)
    : `${APP_URL}/dashboard`;
  const dashboardUrl = `${APP_URL}/dashboard/memorials`;

  sendEmailAsync({
    to:      params.familyEmail,
    subject: `You now manage ${params.memorialTitle}'s memorial`,
    html:    renderHandoverAcceptedFamEmail({
      memorialTitle:     params.memorialTitle,
      familyContactName: params.familyContactName,
      memorialUrl,
      dashboardUrl,
    }),
  });
}

// ── 7. Expiry warning ─────────────────────────────────────────────────────────

export async function sendExpiryWarning(params: {
  ownerEmail:     string;
  memorialId:     string;
  memorialTitle:  string;
  expiresAt:      Date;
  yearsRemaining: number;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'EXPIRY_WARNING', params.memorialId)) return;

  const renewUrl = `${APP_URL}/dashboard/memorial/${params.memorialId}/settings`;

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `Action needed: ${params.memorialTitle} expires in ${params.yearsRemaining} ${params.yearsRemaining === 1 ? 'year' : 'years'}`,
    html:    renderExpiryWarningEmail({
      memorialTitle:  params.memorialTitle,
      ownerEmail:     params.ownerEmail,
      expiresAt:      params.expiresAt,
      renewUrl,
      yearsRemaining: params.yearsRemaining,
    }),
  });

  if (orgId) recordBatchSent(orgId, 'EXPIRY_WARNING', params.memorialId);
}

// ── 8. Memorial suspended ─────────────────────────────────────────────────────

export async function sendMemorialSuspended(params: {
  ownerEmail:    string;
  memorialId:    string;
  memorialTitle: string;
  expiresAt:     Date;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'MEMORIAL_SUSPENDED')) return;

  const renewUrl = `${APP_URL}/dashboard/memorial/${params.memorialId}/settings`;

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `Memorial suspended — ${params.memorialTitle}`,
    html:    renderMemorialSuspendedEmail({
      memorialTitle: params.memorialTitle,
      renewUrl,
      expiresAt:     params.expiresAt,
    }),
  });
}

// ── 9. Last chance to upload — sent to family/nominated contact ──────────────
//
// Fires once per memorial, ~5 days before the service (see
// lib/memorial/journeyGate.ts for the exact timing and
// lib/jobs/job-journey-automation.ts for the cron that calls this).

export async function sendLastChanceUpload(params: {
  familyEmail:      string;
  familyName?:      string;
  memorialId:       string;
  memorialTitle:    string;
  funeralHomeName:  string;
  uploadUrl:        string;
  daysUntilService: number;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'LAST_CHANCE_UPLOAD', params.memorialId)) return;

  sendEmailAsync({
    to:      params.familyEmail,
    subject: `Last chance to share photos for ${params.memorialTitle}'s memorial`,
    html:    renderLastChanceUploadEmail({
      memorialTitle:    params.memorialTitle,
      familyName:       params.familyName,
      uploadUrl:        params.uploadUrl,
      funeralHomeName:  params.funeralHomeName,
      daysUntilService: params.daysUntilService,
    }),
  });

  if (orgId) recordBatchSent(orgId, 'LAST_CHANCE_UPLOAD', params.memorialId);
}

// ── 10. Ready to publish — sent to funeral home staff/owner ──────────────────
//
// Fires once per memorial, the day before the service.

export async function sendPublishPrompt(params: {
  ownerEmail:    string;
  ownerName?:    string;
  memorialId:    string;
  memorialTitle: string;
  pendingCount:  number;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'PUBLISH_PROMPT', params.memorialId)) return;

  const previewUrl = `${APP_URL}/dashboard/memorial/${params.memorialId}/preview`;
  const videoUrl    = `${APP_URL}/dashboard/memorial/${params.memorialId}/video`;

  sendEmailAsync({
    to:      params.ownerEmail,
    subject: `${params.memorialTitle}'s service is tomorrow — ready to publish?`,
    html:    renderPublishPromptEmail({
      memorialTitle: params.memorialTitle,
      ownerName:     params.ownerName,
      previewUrl,
      videoUrl,
      pendingCount:  params.pendingCount,
    }),
  });

  if (orgId) recordBatchSent(orgId, 'PUBLISH_PROMPT', params.memorialId);
}

// ── Family access granted → family ────────────────────────────────────────
//
// Called once, when staff generates a memorial's family-access
// token/QR (see app/api/memorial/[memorialId]/handover/family-access/route.ts).
// FAMILY_ACCESS_GRANTED is hard-forced on in lib/email/policy.ts — this
// email IS the delivery mechanism for the family's access link, not a
// secondary notification.

export async function sendFamilyAccessGranted(params: {
  familyEmail:       string;
  familyContactName: string;
  memorialId:        string;
  memorialTitle:     string;
  familyAccessToken: string;
}): Promise<void> {
  const orgId = await getOrgIdForMemorial(params.memorialId);
  if (!await shouldSend(orgId, 'FAMILY_ACCESS_GRANTED')) return;

  const familyAccessUrl = `${APP_URL}/family/${params.familyAccessToken}`;

  sendEmailAsync({
    to:      params.familyEmail,
    subject: `Manage ${params.memorialTitle}'s memorial`,
    html:    renderFamilyAccessGrantedEmail({
      memorialTitle:     params.memorialTitle,
      familyContactName: params.familyContactName,
      familyAccessUrl,
    }),
  });
}

// ── Payment failed — sent to every OWNER-role member of the org ────────────
//
// Called from app/api/billing/webhook/route.ts's handlePaymentFailed().
// Unlike most senders above, this is keyed by orgId directly rather than
// memorialId — billing lives on Organisation, not an individual memorial.
// Organisation has no email field of its own (it's Clerk-backed via
// clerkOrgId), so every OrgMember with role OWNER is resolved and their
// email looked up through Clerk. Sent to every owner, not just one —
// better to over-notify a billing failure than have it land on a single
// inbox nobody checks.

export async function sendPaymentFailedEmail(params: {
  orgId:      string;
  orgName:    string;
  amountDue?: string; // pre-formatted, e.g. "$298.00 AUD"
  retryDate?: string; // pre-formatted, e.g. "18 September 2026"
}): Promise<void> {
  // PAYMENT_FAILED is hard-forced on in shouldSend() — this call exists
  // for consistency with every other sender, not because it can suppress.
  if (!await shouldSend(params.orgId, 'PAYMENT_FAILED')) return;

  const owners = await prisma.orgMember.findMany({
    where:  { organisationId: params.orgId, role: 'OWNER' },
    select: { userId: true },
  });

  if (owners.length === 0) {
    console.error(`sendPaymentFailedEmail: org ${params.orgId} has no OWNER-role member`);
    return;
  }

  const billingUrl = `${APP_URL}/dashboard/billing`;
  const html = renderPaymentFailedEmail({
    orgName:    params.orgName,
    billingUrl,
    amountDue:  params.amountDue,
    retryDate:  params.retryDate,
  });

  const clerk = await clerkClient();

  for (const owner of owners) {
    try {
      const user = await clerk.users.getUser(owner.userId);
      const email = user.emailAddresses?.[0]?.emailAddress;
      if (!email) continue;

      sendEmailAsync({
        to:      email,
        subject: `Action needed: payment failed for ${params.orgName}`,
        html,
      });
    } catch (error) {
      console.error(`sendPaymentFailedEmail: failed to notify owner ${owner.userId}`, error);
    }
  }
}
