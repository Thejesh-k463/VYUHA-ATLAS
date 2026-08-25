import { describe, expect, it } from "vitest";
import { ayOf, fyBounds, fyOf, heldOverMonths, inFy } from "@/lib/tax/fy";
import { DEFAULT_TAX_RATES, resolveRate } from "@/lib/tax/rates";
import { classifyEquityTrades, classifyMfGains } from "@/lib/tax/capital-gains";
import { auditVerdict, summarizeFno, type FnoSummary } from "@/lib/tax/fno";
import { generate112aCsv, validate112aCsv } from "@/lib/tax/schedule112a";
import { advanceSchedule, estimateTax } from "@/lib/tax/advance";
import type { LotTx } from "@/lib/domain/lots";

describe("financial year helpers", () => {
  it("splits at April 1", () => {
    expect(fyOf("2026-03-31")).toBe("2025-26");
    expect(fyOf("2026-04-01")).toBe("2026-27");
    expect(fyBounds("2025-26")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(inFy("2026-03-31", "2025-26")).toBe(true);
    expect(inFy("2026-04-01", "2025-26")).toBe(false);
    expect(ayOf("2025-26")).toBe("AY 2026-27");
  });
  it("12-month boundary is strict (one year + a day is long)", () => {
    expect(heldOverMonths("2024-06-19", "2025-06-19", 12)).toBe(false); // exactly 12 months
    expect(heldOverMonths("2024-06-19", "2025-06-20", 12)).toBe(true);
  });
});

describe("versioned rate resolution", () => {
  const rows = DEFAULT_TAX_RATES.map((r) => ({ key: r.key, effectiveFrom: r.effectiveFrom, value: r.value }));
  it("picks the rate in force on the given date — 23-Jul-2024 change pinned", () => {
    expect((resolveRate(rows, "equity_ltcg", "2024-07-22") as { ratePct: number }).ratePct).toBe(10);
    expect((resolveRate(rows, "equity_ltcg", "2024-07-23") as { ratePct: number }).ratePct).toBe(12.5);
    expect((resolveRate(rows, "equity_stcg", "2024-06-19") as { ratePct: number }).ratePct).toBe(15);
    expect((resolveRate(rows, "equity_stcg", "2026-03-19") as { ratePct: number }).ratePct).toBe(20);
    expect((resolveRate(rows, "equity_ltcg_exemption", "2024-05-01") as { amount: number }).amount).toBe(125000);
    expect((resolveRate(rows, "equity_ltcg_exemption", "2024-03-31") as { amount: number }).amount).toBe(100000);
  });
  it("returns null before any effective date", () => {
    expect(resolveRate(rows, "equity_ltcg", "2010-01-01")).toBeNull();
  });
});

const sip = (date: string, amount: number, units: number): LotTx => ({
  date,
  txType: "purchase_sip",
  amount,
  units,
  nav: amount / units,
});

describe("classifyMfGains", () => {
  const holdings = [
    {
      isin: "INF846K01K35",
      schemeName: "Test Equity Fund, Direct", // comma on purpose — 112A must strip it
      assetClass: "equity",
      transactions: [
        sip("2022-04-13", 2000, 20), // long by 2024-06-19
        sip("2024-01-10", 2000, 20), // short by 2024-06-19
        { date: "2024-06-19", txType: "redemption" as const, amount: -4800, units: -40, nav: 120 },
      ],
    },
    {
      isin: "INF000DEBT01",
      schemeName: "Test Debt Fund",
      assetClass: "debt",
      transactions: [
        sip("2023-01-10", 1000, 100),
        { date: "2024-06-01", txType: "redemption" as const, amount: -1100, units: -100, nav: 11 },
      ],
    },
  ];
  const r = classifyMfGains(holdings, "2024-25");
  it("splits legs at the 12-month boundary within the FY", () => {
    expect(r.ltcgLegs).toHaveLength(1);
    expect(r.stcgLegs).toHaveLength(1);
    expect(r.ltcgLegs[0].lotDate).toBe("2022-04-13");
    expect(r.stcgLegs[0].lotDate).toBe("2024-01-10");
    // legs reconcile: proceeds 4800 split 2400/2400 (equal units), gains 400 each
    expect(r.ltcgLegs[0].gain + r.stcgLegs[0].gain).toBeCloseTo(4800 - 4000, 2);
  });
  it("routes non-equity classes to the slab bucket", () => {
    expect(r.slabLegs).toHaveLength(1);
    expect(r.slabTotal).toBeCloseTo(100, 2);
  });
  it("filters by FY", () => {
    const other = classifyMfGains(holdings, "2025-26");
    expect(other.stcgLegs.length + other.ltcgLegs.length + other.slabLegs.length).toBe(0);
  });
});

describe("classifyEquityTrades", () => {
  const trades = [
    { symbol: "TCS", segment: "eq_delivery", buyDate: "2024-01-05", sellDate: "2024-06-10", buyValue: 10000, sellValue: 11000, grossPnl: 1000, netPnl: 980 },
    { symbol: "INFY", segment: "eq_delivery", buyDate: "2023-04-01", sellDate: "2024-06-10", buyValue: 5000, sellValue: 6000, grossPnl: 1000, netPnl: 990 },
    { symbol: "DHAN?", segment: "eq_delivery", buyDate: null, sellDate: null, buyValue: null, sellValue: null, grossPnl: null, netPnl: -500 },
    { symbol: "NIFTY", segment: "fno_options", buyDate: "2024-05-01", sellDate: "2024-05-02", buyValue: 1, sellValue: 2, grossPnl: 1, netPnl: 1 },
  ];
  it("classifies delivery trades ST/LT, quarantines undated, ignores F&O", () => {
    const r = classifyEquityTrades(trades, "2024-25");
    expect(r.stcg).toHaveLength(1);
    expect(r.ltcg).toHaveLength(1);
    expect(r.stcgTotal).toBe(1000);
    expect(r.unclassifiable).toHaveLength(1);
    expect(r.unclassifiable[0].reason).toContain("no dates");
  });
});

describe("F&O turnover + audit verdict (ICAI absolutes, config thresholds)", () => {
  const CFG = { auditTurnover: 100_000_000, presumptiveLimit: 30_000_000, presumptiveRatePct: 6 };
  const t = (grossPnl: number, sellDate = "2025-06-01") => ({
    symbol: "NIFTY", segment: "fno_options", sellDate, buyDate: "2025-05-25",
    grossPnl, netPnl: grossPnl - 10, chargesTotal: 10,
  });
  it("turnover is the absolute sum, profits and losses alike", () => {
    const s = summarizeFno([t(50_000), t(-30_000)], "2025-26");
    expect(s.turnover).toBe(80_000);
    expect(s.netPnl).toBe(50_000 - 10 - 30_000 - 10);
  });
  it("undated trades never join a FY — counted loudly instead", () => {
    const s = summarizeFno(
      [t(1000), { symbol: "X", segment: "fno_options", sellDate: null, buyDate: null, grossPnl: null, netPnl: -500, chargesTotal: 5 }],
      "2025-26",
    );
    expect(s.tradeCount).toBe(1);
    expect(s.undatedCount).toBe(1);
    expect(s.undatedNetPnl).toBe(-500);
  });
  const base: FnoSummary = { tradeCount: 10, turnover: 0, grossPnl: 0, netPnl: 0, charges: 0, usedNetForTurnover: 0, undatedCount: 0, undatedNetPnl: 0 };
  it("verdict tree hits every branch", () => {
    expect(auditVerdict({ ...base, tradeCount: 0 }, CFG).verdict).toBe("no_activity");
    expect(auditVerdict({ ...base, turnover: 150_000_000 }, CFG).verdict).toBe("audit_required");
    expect(auditVerdict({ ...base, turnover: 1_000_000, netPnl: 100_000 }, CFG).verdict).toBe("no_audit"); // 10% > 6%
    expect(auditVerdict({ ...base, turnover: 1_000_000, netPnl: -50_000 }, CFG).verdict).toBe("audit_likely"); // loss
    expect(auditVerdict({ ...base, turnover: 50_000_000, netPnl: 1_000_000 }, CFG).verdict).toBe("no_audit"); // between limits
  });
});

describe("Schedule 112A CSV (GATE: portal rules)", () => {
  const legs = [
    {
      isin: "INF846K01K35",
      schemeName: "Axis Small Cap Fund, Direct Growth", // comma must be stripped
      assetClass: "equity",
      sellDate: "2026-03-19",
      lotDate: "2023-04-13",
      units: 28.909,
      cost: 1999.9,
      proceeds: 11234.56,
      gain: 9234.66,
      term: "long" as const,
    },
  ];
  const csv = generate112aCsv(legs);
  it("generated CSV passes the portal validator clean", () => {
    expect(validate112aCsv(csv)).toEqual([]);
  });
  it("uses DD/MM/YYYY, AE code, and no commas in values", () => {
    const row = csv.split("\r\n")[1];
    expect(row).toContain("19/03/2026");
    expect(row.startsWith("AE,")).toBe(true);
    expect(row).toContain("Axis Small Cap Fund Direct Growth"); // comma gone
    expect(row.split(",").length).toBe(11); // no stray commas from amounts
    expect(row).toContain("11234.56"); // no thousands separator
  });
  it("validator catches every portal violation class", () => {
    const bad = [
      csv.split("\r\n")[0],
      // wrong code, bad ISIN, comma-in-number (splits the row), bad date
      'XX,BADISIN,Some Fund,10.000,100.0000,1,000.00,900.00,0,0,0.00,2026-03-19',
    ].join("\r\n");
    const v = validate112aCsv(bad);
    const problems = v.map((x) => x.field + ":" + x.problem).join(" | ");
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(problems).toContain("comma"); // the comma-in-amount broke the column count
    const bad2 = [
      csv.split("\r\n")[0],
      'XX,BADISIN,Some Fund,10.000,100.0000,1000.00,900.00,0,0,0.00,2026-13-45',
    ].join("\r\n");
    const v2 = validate112aCsv(bad2);
    const fields = v2.map((x) => x.field);
    expect(fields).toContain("Share/Unit Acquired");
    expect(fields).toContain("ISIN Code");
    expect(fields).toContain("Date of Sale/Transfer");
  });
});

describe("tax estimate + advance schedule", () => {
  it("applies the LTCG exemption and cess (hand-computed)", () => {
    const e = estimateTax({
      stcg111a: 100_000, ltcg112a: 200_000, slabIncome: 0,
      stcgRatePct: 20, ltcgRatePct: 12.5, ltcgExemption: 125_000, slabRatePct: 30, cessPct: 4,
    });
    expect(e.stcgTax).toBe(20_000);
    expect(e.ltcgTaxable).toBe(75_000);
    expect(e.ltcgTax).toBe(9_375);
    expect(e.subtotal).toBe(29_375);
    expect(e.cess).toBe(1_175);
    expect(e.total).toBe(30_550);
  });
  it("losses produce no negative tax, only notes", () => {
    const e = estimateTax({
      stcg111a: -50_000, ltcg112a: -10_000, slabIncome: -143_671,
      stcgRatePct: 20, ltcgRatePct: 12.5, ltcgExemption: 125_000, slabRatePct: 30, cessPct: 4,
    });
    expect(e.total).toBe(0);
    expect(e.notes.join(" ")).toContain("carry forward");
  });
  it("advance schedule: 15/45/75/100 with correct FY dates, empty under threshold", () => {
    const cfg = {
      threshold: 10_000,
      installments: [
        { due: "06-15", cumulativePct: 15 },
        { due: "09-15", cumulativePct: 45 },
        { due: "12-15", cumulativePct: 75 },
        { due: "03-15", cumulativePct: 100 },
      ],
    };
    const rows = advanceSchedule(100_000, "2025-26", cfg);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ dueDate: "2025-06-15", installment: 15_000 });
    expect(rows[3]).toMatchObject({ dueDate: "2026-03-15", installment: 25_000, cumulativeDue: 100_000 });
    expect(advanceSchedule(9_999, "2025-26", cfg)).toEqual([]);
  });
});
