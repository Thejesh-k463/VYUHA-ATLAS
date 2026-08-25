// Pure F&O business-income view: ICAI turnover + s44AB/s44AD audit verdict.
// No DB, no React. Thresholds arrive from the versioned tax_rates config —
// never hardcoded here.
//
// ICAI Guidance Note convention: F&O turnover = Σ |profit or loss| per trade
// (favourable + unfavourable differences). Gross P&L (before charges) is used
// when the envelope carries it; otherwise |net| with a per-row flag.

import { roundPaise } from "@/lib/domain/money";
import { fyOf } from "@/lib/tax/fy";

export interface FnoTradeInput {
  symbol: string;
  segment: string;
  sellDate: string | null;
  buyDate: string | null;
  grossPnl: number | null;
  netPnl: number;
  chargesTotal: number;
}

export function isFnoSegment(segment: string): boolean {
  return /fno|fut|opt|deriv/i.test(segment);
}

export function isIntradaySegment(segment: string): boolean {
  return /intraday|speculat/i.test(segment);
}

export interface FnoSummary {
  tradeCount: number;
  turnover: number; // ICAI absolute sum
  grossPnl: number;
  netPnl: number;
  charges: number;
  usedNetForTurnover: number; // rows where grossPnl was missing
  undatedCount: number; // closed trades with no date — cannot join any FY
  undatedNetPnl: number;
}

export function summarizeFno(
  trades: FnoTradeInput[],
  fy: string,
  segmentFilter: (segment: string) => boolean = isFnoSegment,
): FnoSummary {
  let turnover = 0;
  let grossPnl = 0;
  let netPnl = 0;
  let charges = 0;
  let tradeCount = 0;
  let usedNetForTurnover = 0;
  let undatedCount = 0;
  let undatedNetPnl = 0;
  for (const t of trades) {
    if (!segmentFilter(t.segment)) continue;
    const date = t.sellDate || t.buyDate;
    if (!date) {
      undatedCount++;
      undatedNetPnl = roundPaise(undatedNetPnl + t.netPnl);
      continue;
    }
    if (fyOf(date) !== fy) continue;
    tradeCount++;
    const basis = t.grossPnl ?? t.netPnl;
    if (t.grossPnl === null) usedNetForTurnover++;
    turnover = roundPaise(turnover + Math.abs(basis));
    grossPnl = roundPaise(grossPnl + (t.grossPnl ?? t.netPnl));
    netPnl = roundPaise(netPnl + t.netPnl);
    charges = roundPaise(charges + t.chargesTotal);
  }
  return { tradeCount, turnover, grossPnl, netPnl, charges, usedNetForTurnover, undatedCount, undatedNetPnl };
}

export interface AuditConfig {
  auditTurnover: number; // audit mandatory above this (digital)
  presumptiveLimit: number; // s44AD eligible up to this (digital)
  presumptiveRatePct: number;
}

export interface AuditVerdict {
  verdict: "audit_required" | "audit_likely" | "no_audit_presumptive" | "no_audit" | "no_activity";
  reasons: string[];
  assumptions: string[];
}

/** s44AB/s44AD decision tree with the standing retail assumption of ≥95% digital. */
export function auditVerdict(summary: FnoSummary, cfg: AuditConfig): AuditVerdict {
  const assumptions = [
    "≥95% of receipts and payments are digital (true for exchange-traded F&O).",
    "F&O is non-speculative business income (s43(5)(d)).",
  ];
  if (summary.tradeCount === 0) {
    return { verdict: "no_activity", reasons: ["No dated F&O trades in this FY."], assumptions: [] };
  }
  const reasons: string[] = [];
  if (summary.turnover > cfg.auditTurnover) {
    reasons.push(
      `Turnover ${fmt(summary.turnover)} exceeds the ${fmt(cfg.auditTurnover)} s44AB limit — tax audit is mandatory.`,
    );
    return { verdict: "audit_required", reasons, assumptions };
  }
  const presumptiveIncome = roundPaise((summary.turnover * cfg.presumptiveRatePct) / 100);
  if (summary.turnover <= cfg.presumptiveLimit) {
    if (summary.netPnl >= presumptiveIncome) {
      reasons.push(
        `Turnover ${fmt(summary.turnover)} is within the s44AD limit and actual profit ${fmt(summary.netPnl)} ≥ ${cfg.presumptiveRatePct}% presumptive income ${fmt(presumptiveIncome)} — declare actual or presumptive, no audit.`,
      );
      return { verdict: "no_audit", reasons, assumptions };
    }
    reasons.push(
      `Turnover ${fmt(summary.turnover)} is s44AD-eligible but actual result ${fmt(summary.netPnl)} is below ${cfg.presumptiveRatePct}% presumptive income ${fmt(presumptiveIncome)}.`,
      "Declaring the lower actual result (or a loss) while total income exceeds the basic exemption generally triggers books + audit (s44AD(4)/44AB(e)); declaring presumptive income avoids it but taxes notional profit.",
    );
    return { verdict: "audit_likely", reasons, assumptions };
  }
  reasons.push(
    `Turnover ${fmt(summary.turnover)} is between the s44AD limit and the s44AB digital limit ${fmt(cfg.auditTurnover)} — no audit purely on turnover.`,
  );
  return { verdict: "no_audit", reasons, assumptions };
}

function fmt(n: number): string {
  return `₹${Math.abs(n) >= 1e7 ? (n / 1e7).toFixed(2) + "Cr" : Math.abs(n) >= 1e5 ? (n / 1e5).toFixed(2) + "L" : n.toLocaleString("en-IN")}`;
}
