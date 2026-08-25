import { describe, expect, it } from "vitest";
import { lifeAdequacy, type AdequacyInputs } from "@/lib/analytics/protection";
import { annualizedPremium, renewalInfo } from "@/lib/domain/insurance";

// Hand-computed adequacy fixture (gate item 2):
//   liabilities 8,00,000 + inflated goals 17,90,847.70
//   + expenses 40,000 × 12 × 15y = 72,00,000
//   − counted assets 12,00,000
//   = required 85,90,847.70; gap vs 25,00,000 cover = 60,90,847.70
const BASE: AdequacyInputs = {
  liabilitiesTotal: 800000,
  goalTargetsInflated: 1790847.7,
  monthlyExpenses: 40000,
  countedAssets: 1200000,
  existingLifeCover: 2500000,
  yearsOfExpenses: 15,
  annualIncome: null,
  incomeMultiple: 10,
};

describe("lifeAdequacy", () => {
  it("matches the hand-computed needs-based figure to the paisa", () => {
    const r = lifeAdequacy(BASE);
    expect(r.requiredCover).toBeCloseTo(8590847.7, 2);
    expect(r.gap).toBeCloseTo(6090847.7, 2);
    expect(r.incomplete).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.components).toHaveLength(4);
    expect(r.components.every((c) => c.basis !== "rule-of-thumb")).toBe(true);
  });

  it("missing expense data stays missing — never fabricated as 0", () => {
    const r = lifeAdequacy({ ...BASE, monthlyExpenses: null });
    const exp = r.components.find((c) => c.key === "expenses")!;
    expect(exp.amount).toBeNull();
    expect(r.incomplete).toBe(true);
    expect(r.missing).toEqual(["expenses"]);
    // total excludes the missing component: 8,00,000 + 17,90,847.70 − 12,00,000
    expect(r.requiredCover).toBeCloseTo(1390847.7, 2);
  });

  it("rule-of-thumb appears ONLY with a user-stated income, and only labeled", () => {
    expect(lifeAdequacy(BASE).ruleOfThumb).toBeNull();
    const r = lifeAdequacy({ ...BASE, annualIncome: 1200000 });
    expect(r.ruleOfThumb).toEqual({ requiredCover: 12000000, gap: 9500000, multiple: 10 });
    // the needs-based components stay untouched by it
    expect(r.requiredCover).toBeCloseTo(8590847.7, 2);
  });

  it("floors required cover at zero when assets already exceed every need", () => {
    const r = lifeAdequacy({ ...BASE, countedAssets: 99000000 });
    expect(r.requiredCover).toBe(0);
    expect(r.gap).toBe(-2500000); // surplus is reported, not hidden
  });
});

describe("renewalInfo", () => {
  const today = "2026-08-26";
  it("classifies overdue / due_soon / upcoming / ok at the documented boundaries", () => {
    expect(renewalInfo("2026-08-25", today)).toEqual({ status: "overdue", daysUntil: -1 });
    expect(renewalInfo("2026-08-26", today)).toEqual({ status: "due_soon", daysUntil: 0 });
    expect(renewalInfo("2026-09-25", today)).toEqual({ status: "due_soon", daysUntil: 30 });
    expect(renewalInfo("2026-09-26", today)).toEqual({ status: "upcoming", daysUntil: 31 });
    expect(renewalInfo("2026-11-24", today)).toEqual({ status: "upcoming", daysUntil: 90 });
    expect(renewalInfo("2026-11-25", today)).toEqual({ status: "ok", daysUntil: 91 });
  });
});

describe("annualizedPremium", () => {
  it("scales by frequency; single premium adds nothing annually", () => {
    expect(annualizedPremium(12000, "monthly")).toBe(144000);
    expect(annualizedPremium(25000, "half_yearly")).toBe(50000);
    expect(annualizedPremium(9000, "quarterly")).toBe(36000);
    expect(annualizedPremium(50000, "yearly")).toBe(50000);
    expect(annualizedPremium(100000, "single")).toBe(0);
  });
});
