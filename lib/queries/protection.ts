import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  insurancePolicies,
  nominees,
  protectionSettings,
  type InsuranceKind,
  type NomineeAssetType,
  type PremiumFrequency,
} from "@/lib/db/schema";
import { annualizedPremium, renewalInfo, type RenewalInfo } from "@/lib/domain/insurance";
import { lifeAdequacy, type AdequacyResult } from "@/lib/analytics/protection";
import { nomineeReport, type NomineeAssetRef, type NomineeEntry, type NomineeReport } from "@/lib/analytics/nominees";
import { medianMonthlySpend } from "@/lib/analytics/emergency";
import { computeNetWorth } from "@/lib/analytics/networth";
import { formatInr, roundPaise } from "@/lib/domain/money";
import { listAccountsWithBalances } from "@/lib/queries/accounts";
import { getInvestmentsView } from "@/lib/queries/investments";
import { getTradingFacts } from "@/lib/queries/trading";
import { getGoalsView } from "@/lib/queries/goals";
import { recentSpending } from "@/lib/queries/expenses";
import type { DeathPackPayload, DeathPackSection } from "@/lib/export/death-pack";

// ---- Policies ----

export interface PolicyView {
  id: number;
  kind: InsuranceKind;
  insurer: string;
  policyNo: string;
  planName: string | null;
  sumAssured: number;
  premium: number;
  premiumFrequency: PremiumFrequency;
  renewalDate: string;
  startDate: string | null;
  owner: string;
  note: string | null;
  renewal: RenewalInfo;
  annualPremium: number;
}

function activePolicies() {
  return getDb()
    .select()
    .from(insurancePolicies)
    .all()
    .filter((p) => !p.archivedAt);
}

export function listPolicies(todayIso: string): PolicyView[] {
  return activePolicies()
    .map((p) => ({
      ...(p as Omit<PolicyView, "renewal" | "annualPremium">),
      kind: p.kind as InsuranceKind,
      premiumFrequency: p.premiumFrequency as PremiumFrequency,
      renewal: renewalInfo(p.renewalDate, todayIso),
      annualPremium: annualizedPremium(p.premium, p.premiumFrequency as PremiumFrequency),
    }))
    .sort((a, b) => a.renewal.daysUntil - b.renewal.daysUntil);
}

export interface PolicyInput {
  kind: InsuranceKind;
  insurer: string;
  policyNo: string;
  planName?: string | null;
  sumAssured: number; // rupees
  premium: number; // rupees per period
  premiumFrequency: PremiumFrequency;
  renewalDate: string;
  startDate?: string | null;
  owner?: string;
  note?: string | null;
}

export function createPolicy(input: PolicyInput): number {
  const rows = getDb()
    .insert(insurancePolicies)
    .values({ ...input, owner: input.owner ?? "self" })
    .returning({ id: insurancePolicies.id })
    .all();
  return rows[0].id;
}

export function updatePolicy(id: number, patch: Partial<PolicyInput>): void {
  getDb().update(insurancePolicies).set(patch).where(eq(insurancePolicies.id, id)).run();
}

export function deletePolicy(id: number): void {
  const db = getDb();
  // Only this policy's nominee rows go with it.
  db.delete(nominees).where(and(eq(nominees.assetType, "insurance"), eq(nominees.refId, id))).run();
  db.delete(insurancePolicies).where(eq(insurancePolicies.id, id)).run();
}

// ---- Nominees ----

export function addNominee(input: {
  assetType: NomineeAssetType;
  refId: number;
  name: string;
  relationship?: string | null;
  sharePct?: number | null;
}): number {
  const rows = getDb()
    .insert(nominees)
    .values({ ...input, sharePct: input.sharePct ?? null, source: "manual" })
    .returning({ id: nominees.id })
    .all();
  return rows[0].id;
}

export function deleteNominee(id: number): void {
  getDb().delete(nominees).where(eq(nominees.id, id)).run();
}

// ---- Settings (single row, id = 1) ----

export interface ProtectionSettingsView {
  yearsOfExpenses: number;
  annualIncome: number | null;
  incomeMultiple: number;
  contacts: { name: string; relation: string; phone: string; note: string }[];
  instructions: string;
}

export function getProtectionSettings(): ProtectionSettingsView {
  const db = getDb();
  let row = db.select().from(protectionSettings).where(eq(protectionSettings.id, 1)).all()[0];
  if (!row) {
    db.insert(protectionSettings).values({ id: 1 }).run();
    row = db.select().from(protectionSettings).where(eq(protectionSettings.id, 1)).all()[0];
  }
  let contacts: ProtectionSettingsView["contacts"] = [];
  try {
    const parsed = row.contactsJson ? JSON.parse(row.contactsJson) : [];
    if (Array.isArray(parsed)) contacts = parsed;
  } catch {
    // unreadable JSON renders as no contacts, never a crash
  }
  return {
    yearsOfExpenses: row.yearsOfExpenses,
    annualIncome: row.annualIncome,
    incomeMultiple: row.incomeMultiple,
    contacts,
    instructions: row.instructions ?? "",
  };
}

export function updateProtectionSettings(patch: {
  yearsOfExpenses?: number;
  annualIncome?: number | null;
  incomeMultiple?: number;
  contacts?: ProtectionSettingsView["contacts"];
  instructions?: string;
}): void {
  getProtectionSettings(); // ensure the row exists
  const { contacts, ...rest } = patch;
  getDb()
    .update(protectionSettings)
    .set({
      ...rest,
      ...(contacts !== undefined ? { contactsJson: JSON.stringify(contacts) } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(protectionSettings.id, 1))
    .run();
}

// ---- Asset universe for the nominee report and the death pack ----

interface AssetsSnapshot {
  refs: NomineeAssetRef[];
  entries: NomineeEntry[];
}

function nomineeUniverse(todayIso: string): AssetsSnapshot {
  const refs: NomineeAssetRef[] = [];
  for (const p of listPolicies(todayIso)) {
    refs.push({
      assetType: "insurance",
      refId: p.id,
      label: `${p.insurer} ${p.policyNo} (${p.kind})`,
      value: p.sumAssured,
    });
  }
  const inv = getInvestmentsView();
  if (inv.imported && inv.portfolio) {
    for (const h of inv.portfolio.holdings) {
      if (h.unitsHeld > 0.0005) {
        refs.push({
          assetType: "mf_holding",
          refId: h.id,
          label: `${h.schemeName} (folio ${h.folio})`,
          value: h.currentValue,
        });
      }
    }
  }
  for (const a of listAccountsWithBalances()) {
    if (a.category === "asset") {
      refs.push({ assetType: "account", refId: a.accountId, label: a.name, value: a.balance });
    }
  }
  const trading = getTradingFacts();
  if (trading.imported) {
    refs.push({ assetType: "trading", refId: 0, label: "Trading book (VYUHA)", value: trading.equity.equity });
  }
  const entries: NomineeEntry[] = getDb()
    .select()
    .from(nominees)
    .all()
    .map((n) => ({
      assetType: n.assetType,
      refId: n.refId,
      name: n.name,
      sharePct: n.sharePct,
      source: n.source,
    }));
  return { refs, entries };
}

export function listNomineeRows(): {
  id: number;
  assetType: string;
  refId: number;
  name: string;
  relationship: string | null;
  sharePct: number | null;
  source: string;
}[] {
  return getDb().select().from(nominees).all();
}

// ---- The /protection view ----

export interface ProtectionView {
  policies: PolicyView[];
  premiumAnnualTotal: number;
  reminders: PolicyView[]; // overdue + due_soon
  adequacy: AdequacyResult;
  adequacyBasis: {
    monthsOfSpendData: number;
    liabilitiesTotal: number;
    goalCount: number;
    countedAssets: number;
    lifePolicyCount: number;
  };
  report: NomineeReport;
  settings: ProtectionSettingsView;
}

function monthlyBurn(todayIso: string): { median: number | null; monthsUsed: number } {
  // Same basis as the emergency gauge (lib/queries/goals.ts): up to 6 completed
  // months of real imported spending; the current month is excluded.
  const currentMonth = todayIso.slice(0, 7);
  const spentMonths = recentSpending(8)
    .filter((m) => m.month !== currentMonth)
    .slice(0, 6)
    .map((m) => m.spent);
  return { median: medianMonthlySpend(spentMonths), monthsUsed: spentMonths.length };
}

export function getProtectionView(todayIso: string): ProtectionView {
  const policies = listPolicies(todayIso);
  const settings = getProtectionSettings();

  const accounts = listAccountsWithBalances();
  const liabilitiesTotal = computeNetWorth(accounts).liabilities;

  const inv = getInvestmentsView();
  const mfValue = inv.imported && inv.portfolio ? inv.portfolio.totalValue : 0;
  const trading = getTradingFacts();
  const tradingEquity = trading.imported ? trading.equity.equity : 0;
  const accountAssets = accounts
    .filter((a) => a.category === "asset" && a.kind !== "property" && a.balance !== null)
    .reduce((s, a) => s + (a.balance ?? 0), 0);
  const countedAssets = roundPaise(mfValue + tradingEquity + accountAssets);

  const goalsView = getGoalsView(todayIso);
  const goalTargetsInflated = roundPaise(goalsView.goals.reduce((s, g) => s + g.inflatedTarget, 0));

  const burn = monthlyBurn(todayIso);
  const existingLifeCover = policies.filter((p) => p.kind === "life").reduce((s, p) => s + p.sumAssured, 0);

  const adequacy = lifeAdequacy({
    liabilitiesTotal,
    goalTargetsInflated,
    monthlyExpenses: burn.median,
    countedAssets,
    existingLifeCover,
    yearsOfExpenses: settings.yearsOfExpenses,
    annualIncome: settings.annualIncome,
    incomeMultiple: settings.incomeMultiple,
  });

  const { refs, entries } = nomineeUniverse(todayIso);

  return {
    policies,
    premiumAnnualTotal: roundPaise(policies.reduce((s, p) => s + p.annualPremium, 0)),
    reminders: policies.filter((p) => p.renewal.status === "overdue" || p.renewal.status === "due_soon"),
    adequacy,
    adequacyBasis: {
      monthsOfSpendData: burn.monthsUsed,
      liabilitiesTotal,
      goalCount: goalsView.goals.length,
      countedAssets,
      lifePolicyCount: policies.filter((p) => p.kind === "life").length,
    },
    report: nomineeReport(refs, entries),
    settings,
  };
}

/** Light view for the Map strip. */
export function getRenewalReminders(todayIso: string): PolicyView[] {
  return listPolicies(todayIso).filter((p) => p.renewal.status === "overdue" || p.renewal.status === "due_soon");
}

// ---- Death pack payload (plaintext exists only in memory — the route encrypts) ----

const fmt = (r: number | null | undefined): string => (r === null || r === undefined ? "—" : formatInr(r));

export function buildDeathPackPayload(todayIso: string, nowIso: string): DeathPackPayload {
  const settings = getProtectionSettings();
  const policies = listPolicies(todayIso);
  const accounts = listAccountsWithBalances();
  const inv = getInvestmentsView();
  const trading = getTradingFacts();
  const { entries } = nomineeUniverse(todayIso);

  const nomineesFor = (assetType: string, refId: number): string => {
    const names = entries
      .filter((e) => e.assetType === assetType && e.refId === refId)
      .map((e) => (e.sharePct === null ? e.name : `${e.name} (${e.sharePct}%)`));
    return names.length ? names.join(", ") : "none on record";
  };

  const sections: DeathPackSection[] = [];

  sections.push({
    title: "Read this first",
    items: [
      {
        label: settings.instructions.trim() || "No personal instructions were recorded.",
        fields: [],
      },
      {
        label: "About this document",
        fields: [
          ["Prepared with", "atlas · by VYUHA (local app on the family computer)"],
          ["Money figures", "Indian rupees, as of the generation date"],
          ["Main database", "data/atlas.sqlite in the app folder — encrypted; backups beside it"],
        ],
      },
    ],
  });

  if (settings.contacts.length > 0) {
    sections.push({
      title: "People to contact",
      items: settings.contacts.map((c) => ({
        label: c.name,
        sub: c.relation,
        fields: [
          ["Phone", c.phone || "—"],
          ["Note", c.note || "—"],
        ].filter(([, v]) => v !== "—") as [string, string][],
      })),
    });
  }

  sections.push({
    title: "Insurance policies",
    note:
      policies.length === 0
        ? "No policies on record."
        : "Call the insurer's claims line with the policy number and a death certificate.",
    items: policies.map((p) => ({
      label: `${p.insurer} — ${p.planName ?? p.kind} (${p.kind})`,
      sub: `Policy no. ${p.policyNo}`,
      fields: [
        ["Sum assured", fmt(p.sumAssured)],
        ["Premium", `${fmt(p.premium)} ${p.premiumFrequency.replace("_", "-")}`],
        ["Next renewal on record", p.renewalDate],
        ["Nominee(s)", nomineesFor("insurance", p.id)],
      ],
    })),
  });

  sections.push({
    title: "Bank & other accounts",
    note: "Balances are the last known figures, not live.",
    items: accounts.map((a) => ({
      label: a.name,
      sub: `${a.kind.replace("_", " ")} · ${a.category} · held by ${a.owner}`,
      fields: [
        ["Last known balance", a.balance === null ? "unknown" : `${fmt(a.balance)} (as of ${a.balanceDate})`],
        ["Nominee(s)", nomineesFor("account", a.accountId)],
      ],
    })),
  });

  if (inv.imported && inv.portfolio) {
    sections.push({
      title: "Mutual funds",
      note: "Claim via the fund house or registrar (CAMS/KFintech) with folio numbers. Values at the latest known NAV.",
      items: inv.portfolio.holdings
        .filter((h) => h.unitsHeld > 0.0005)
        .map((h) => ({
          label: h.schemeName,
          sub: `${h.amc} · folio ${h.folio} · ISIN ${h.isin}`,
          fields: [
            ["Units held", h.unitsHeld.toFixed(3)],
            ["Value", h.currentValue === null ? "unknown (no NAV on record)" : fmt(h.currentValue)],
            ["Nominee(s)", nomineesFor("mf_holding", h.id)],
          ],
        })),
    });
  }

  if (trading.imported) {
    sections.push({
      title: "Trading account",
      items: [
        {
          label: "Trading book (imported from the VYUHA journal)",
          fields: [
            ["Equity (capital + P&L)", fmt(trading.equity.equity)],
            ["Open positions", String(trading.openPositions.length)],
            ["Nominee(s)", nomineesFor("trading", 0)],
            ["Note", "The broker account itself holds the money — contact the broker with the death certificate."],
          ],
        },
      ],
    });
  }

  return {
    atlasDeathPack: true,
    v: 1,
    generatedAt: nowIso,
    title: "atlas · estate pack",
    intro:
      "This is a map of what exists and where, prepared in advance so nothing is lost or forgotten.",
    sections,
  };
}
