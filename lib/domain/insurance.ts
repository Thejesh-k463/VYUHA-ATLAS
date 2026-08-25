// Pure insurance-policy helpers. No DB, no React (AGENTS.md invariant 2).

import type { PremiumFrequency } from "@/lib/db/schema";

export const RENEWAL_DUE_SOON_DAYS = 30;
export const RENEWAL_UPCOMING_DAYS = 90;

export type RenewalStatus = "overdue" | "due_soon" | "upcoming" | "ok";

export interface RenewalInfo {
  status: RenewalStatus;
  /** Days from `today` to the renewal date; negative when overdue. */
  daysUntil: number;
}

const MS_PER_DAY = 86_400_000;

/** Classify a policy's renewal date relative to `today` (both ISO yyyy-mm-dd). */
export function renewalInfo(renewalDateIso: string, todayIso: string): RenewalInfo {
  const days = Math.round(
    (Date.parse(`${renewalDateIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / MS_PER_DAY,
  );
  const status: RenewalStatus =
    days < 0 ? "overdue" : days <= RENEWAL_DUE_SOON_DAYS ? "due_soon" : days <= RENEWAL_UPCOMING_DAYS ? "upcoming" : "ok";
  return { status, daysUntil: days };
}

const PERIODS_PER_YEAR: Record<PremiumFrequency, number> = {
  yearly: 1,
  half_yearly: 2,
  quarterly: 4,
  monthly: 12,
  single: 0, // one-time premium — contributes nothing to the annual outgo
};

/** Annualized premium outgo in rupees for one policy. */
export function annualizedPremium(premium: number, frequency: PremiumFrequency): number {
  return premium * PERIODS_PER_YEAR[frequency];
}
