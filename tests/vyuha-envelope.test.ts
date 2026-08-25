import { describe, expect, it } from "vitest";
import { parseVyuhaEnvelope } from "@/lib/import/vyuha-envelope";

// Fixture mirrors the real envelope contract (backup-format.ts v3):
// trades money in RUPEES, ledger_entries.amountPaise in PAISE. Pinning both here
// means a future "unit cleanup" breaks a test instead of net worth.
const fixture = {
  vyuhaBackup: true as const,
  version: 3,
  createdAt: "2026-08-25T10:00:00.000Z",
  counts: { trades: 4, ledger_entries: 3 },
  tables: {
    trades: [
      { sellDate: "2026-07-14", netPnl: 1500.5, grossPnl: 1620.75, chargesTotal: 120.25, isOpen: false, segment: "eq_delivery", sttCtt: 100, gst: 20.25 },
      { sellDate: "2026-07-20", netPnl: -400, grossPnl: -320, chargesTotal: 80, isOpen: 0, segment: "eq_delivery", sttCtt: 80 },
      { sellDate: "2026-08-02", netPnl: 900, grossPnl: 960, chargesTotal: 60, isOpen: false, segment: "index_option", sttCtt: 60 },
      {
        buyDate: "2026-08-10",
        netPnl: null,
        chargesTotal: null,
        isOpen: true,
        symbol: "RELIANCE",
        segment: "eq_delivery",
        buyValue: 250000,
        sellValue: 50000,
        unrealisedPnl: 1250,
        brokerage: 40,
      },
    ],
    capital_snapshots: [
      { bucket: "equity", asOfDate: "2026-06-19", openingCapital: 395000, realisedPnlToDate: 0 },
      { bucket: "active", asOfDate: "2026-06-19", openingCapital: 360000, realisedPnlToDate: 0 },
    ],
    ledger_entries: [
      { date: "2026-07-01", type: "deposit", amountPaise: 30_000_000 }, // ₹3,00,000
      { date: "2026-07-15", type: "withdrawal", amountPaise: -5_000_000 }, // −₹50,000
      { date: "2026-08-01", type: "dividend", amountPaise: 120_050 }, // ₹1,200.50
    ],
  },
};

describe("parseVyuhaEnvelope", () => {
  it("rejects non-envelopes with a clear error", () => {
    const r = parseVyuhaEnvelope({ hello: "world" });
    expect(r.ok).toBe(false);
  });

  it("refuses versions newer than it understands instead of guessing", () => {
    const r = parseVyuhaEnvelope({ ...fixture, version: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("version 9");
  });

  it("groups closed trades into monthly periods in rupees", () => {
    const r = parseVyuhaEnvelope(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.facts.periods).toEqual([
      { period: "2026-07", realizedPnl: 1100.5, grossPnl: 1300.75, charges: 200.25, tradeCount: 2 },
      { period: "2026-08", realizedPnl: 900, grossPnl: 960, charges: 60, tradeCount: 1 },
    ]);
    expect(r.facts.closedTradeCount).toBe(3);
    expect(r.facts.openTradeCount).toBe(1);
    expect(r.facts.skippedTradeRows).toBe(0);
  });

  it("extracts segments with win counts", () => {
    const r = parseVyuhaEnvelope(fixture);
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.segments).toEqual([
      { segment: "eq_delivery", realizedPnl: 1100.5, charges: 200.25, tradeCount: 2, wins: 1 },
      { segment: "index_option", realizedPnl: 900, charges: 60, tradeCount: 1, wins: 1 },
    ]);
  });

  it("sums charge types across open AND closed trades, sorted largest first", () => {
    const r = parseVyuhaEnvelope(fixture);
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.chargesBreakdown).toEqual([
      { chargeType: "sttCtt", amount: 240 },
      { chargeType: "brokerage", amount: 40 }, // from the OPEN position's entry
      { chargeType: "gst", amount: 20.25 },
    ]);
  });

  it("captures open positions with remaining invested value and nullable MTM", () => {
    const r = parseVyuhaEnvelope(fixture);
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.openPositions).toEqual([
      { symbol: "RELIANCE", segment: "eq_delivery", invested: 200000, unrealizedPnl: 1250 },
    ]);
  });

  it("captures capital snapshots (REAL columns are rupees)", () => {
    const r = parseVyuhaEnvelope(fixture);
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.capital).toHaveLength(2);
    expect(r.facts.capital[0].openingCapital).toBe(395000);
  });

  it("converts ledger paise to rupees, preserving sign", () => {
    const r = parseVyuhaEnvelope(fixture);
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.cashflows).toEqual([
      { date: "2026-07-01", type: "deposit", amount: 300_000 },
      { date: "2026-07-15", type: "withdrawal", amount: -50_000 },
      { date: "2026-08-01", type: "dividend", amount: 1_200.5 },
    ]);
  });

  it("buckets undated closed trades (broker P&L imports) into 'undated', preserving totals", () => {
    const r = parseVyuhaEnvelope({
      ...fixture,
      tables: {
        trades: [
          { sellDate: null, buyDate: null, netPnl: -1805.79, chargesTotal: 499.54, isOpen: false },
          { sellDate: "", buyDate: "", netPnl: 100, chargesTotal: 10, isOpen: false },
        ],
        ledger_entries: [],
      },
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.periods).toEqual([
      { period: "undated", realizedPnl: -1705.79, grossPnl: 0, charges: 509.54, tradeCount: 2 },
    ]);
    expect(r.facts.closedTradeCount).toBe(2);
    expect(r.facts.skippedTradeRows).toBe(0);
  });

  it("skips unvaluable closed trades rather than coercing to zero", () => {
    const r = parseVyuhaEnvelope({
      ...fixture,
      tables: { trades: [{ isOpen: false, netPnl: null }], ledger_entries: [] },
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.skippedTradeRows).toBe(1);
    expect(r.facts.periods).toEqual([]);
  });

  it("tolerates missing tables (partial envelopes)", () => {
    const r = parseVyuhaEnvelope({ ...fixture, tables: {} });
    if (!r.ok) throw new Error(r.error);
    expect(r.facts.periods).toEqual([]);
    expect(r.facts.cashflows).toEqual([]);
  });
});
