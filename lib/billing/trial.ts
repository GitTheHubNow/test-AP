// lib/billing/trial.ts
//
// Free-trial length is platform-admin-controlled (PlatformSettings.trialDays,
// edited via /api/system/trial-settings). It used to be handed to Stripe
// Checkout as trial_period_days; with manual billing it is stamped onto the
// Organisation (trialEndsAt) when the org is created. During the trial,
// usage is recorded but charged at $0 and no base fee applies — see
// lib/billing/pricing.ts.

import { prisma } from '@/lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The trialEndsAt value for an org being created right now (null = no trial). */
export async function computeTrialEndsAt(now: Date = new Date()): Promise<Date | null> {
  const settings = await prisma.platformSettings.findUnique({
    where:  { id: 'singleton' },
    select: { trialDays: true },
  });
  const days = settings?.trialDays ?? 30;
  return days > 0 ? new Date(now.getTime() + days * DAY_MS) : null;
}
