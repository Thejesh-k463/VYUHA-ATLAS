import { describe, expect, it } from "vitest";
import { amortizationSchedule, computeEmi, emisPaidBy, outstandingAt } from "@/lib/domain/emi";

// Reference: ₹30,00,000 @ 8.5% for 240 months — standard calculators give ₹26,035/mo (±1).
describe("computeEmi", () => {
  it("matches the standard home-loan reference figure", () => {
    expect(computeEmi(3_000_000, 8.5, 240)).toBeCloseTo(26_034.78, 0);
  });
  it("degrades to straight-line at zero rate", () => {
    expect(computeEmi(120_000, 0, 12)).toBe(10_000);
  });
});

describe("amortizationSchedule", () => {
  const terms = { principal: 1_000_000, annualRatePct: 9, tenureMonths: 60, startDate: "2026-01-01" };
  const rows = amortizationSchedule(terms);

  it("closes at exactly zero", () => {
    expect(rows[rows.length - 1].outstanding).toBe(0);
  });
  it("principal repaid sums to the principal", () => {
    const total = rows.reduce((s, r) => s + r.principalPaid, 0);
    expect(total).toBeCloseTo(terms.principal, 2);
  });
  it("early months are interest-heavy", () => {
    expect(rows[0].interest).toBeGreaterThan(rows[0].principalPaid * 0.4);
    expect(rows[59].interest).toBeLessThan(rows[59].principalPaid);
  });
});

describe("outstandingAt", () => {
  const terms = { principal: 1_000_000, annualRatePct: 9, tenureMonths: 60, startDate: "2026-01-01" };
  it("is full principal before the first EMI", () => {
    expect(outstandingAt(terms, "2026-01-15")).toBe(1_000_000);
  });
  it("decreases monotonically", () => {
    const a = outstandingAt(terms, "2027-01-01");
    const b = outstandingAt(terms, "2028-01-01");
    expect(b).toBeLessThan(a);
  });
  it("is zero after the tenure ends", () => {
    expect(outstandingAt(terms, "2032-06-01")).toBe(0);
  });
});

describe("emisPaidBy", () => {
  it("same month means zero paid", () => {
    expect(emisPaidBy("2026-01-01", "2026-01-31")).toBe(0);
  });
  it("counts month boundaries", () => {
    expect(emisPaidBy("2026-01-01", "2026-04-10")).toBe(3);
  });
});
