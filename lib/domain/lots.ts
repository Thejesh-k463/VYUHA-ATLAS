// Pure FIFO lot engine for mutual-fund units. No DB, no React (invariant 2).
// Units in, units out — money stays rupees at runtime (invariant 1).

import { roundPaise } from "@/lib/domain/money";
import type { CasTxType } from "@/lib/import/cas-parse";

export interface LotTx {
  date: string; // ISO
  txType: CasTxType;
  amount: number | null; // rupees, signed as in the CAS (outflows negative)
  units: number | null; // signed
  nav: number | null;
}

export interface OpenLot {
  date: string;
  units: number;
  /** Cost basis of the remaining units in this lot, rupees. Zero for segregated units. */
  cost: number;
}

export interface RealizedEvent {
  date: string;
  units: number;
  proceeds: number; // rupees received (net, as the CAS states)
  costConsumed: number; // FIFO cost basis of the units sold
  gain: number; // proceeds − costConsumed
}

export interface LotLedger {
  openLots: OpenLot[];
  unitsHeld: number;
  /** Cost basis of open lots (what the held units cost), rupees. */
  investedCost: number;
  realized: RealizedEvent[];
  realizedGainTotal: number;
  /** Sum of tax_or_charge rows (stamp duty, STT) — informational, not part of lot cost. */
  chargesTotal: number;
  warnings: string[];
}

const ACQUIRING: ReadonlySet<CasTxType> = new Set([
  "purchase",
  "purchase_sip",
  "switch_in",
  "dividend_reinvest",
  "segregation",
]);
const DISPOSING: ReadonlySet<CasTxType> = new Set(["redemption", "switch_out"]);

const UNIT_EPSILON = 0.0005; // CAS prints units to 3dp

/** Build the FIFO lot ledger from a holding's transactions (any order; sorted by date, stable). */
export function buildLots(txs: LotTx[]): LotLedger {
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const open: OpenLot[] = [];
  const realized: RealizedEvent[] = [];
  const warnings: string[] = [];
  let chargesTotal = 0;

  for (const tx of sorted) {
    if (tx.txType === "tax_or_charge") {
      chargesTotal = roundPaise(chargesTotal + Math.abs(tx.amount ?? 0));
      continue;
    }
    if (tx.units === null || Math.abs(tx.units) <= UNIT_EPSILON) continue;

    if (ACQUIRING.has(tx.txType) && tx.units > 0) {
      // Segregated-portfolio units arrive with no amount — a genuine zero-cost lot.
      open.push({ date: tx.date, units: tx.units, cost: Math.abs(tx.amount ?? 0) });
      continue;
    }
    if (DISPOSING.has(tx.txType) && tx.units < 0) {
      let toSell = -tx.units;
      const proceeds = Math.abs(tx.amount ?? 0);
      let costConsumed = 0;
      while (toSell > UNIT_EPSILON && open.length > 0) {
        const lot = open[0];
        if (lot.units <= toSell + UNIT_EPSILON) {
          costConsumed += lot.cost;
          toSell -= lot.units;
          open.shift();
        } else {
          const fraction = toSell / lot.units;
          const costPart = roundPaise(lot.cost * fraction);
          costConsumed += costPart;
          lot.cost = roundPaise(lot.cost - costPart);
          lot.units = lot.units - toSell;
          toSell = 0;
        }
      }
      if (toSell > UNIT_EPSILON) {
        warnings.push(
          `${tx.date}: sold ${(-tx.units).toFixed(3)} units but only ${(-tx.units - toSell).toFixed(3)} were held (FIFO) — excess ignored, never fabricated.`,
        );
      }
      costConsumed = roundPaise(costConsumed);
      realized.push({
        date: tx.date,
        units: -tx.units,
        proceeds,
        costConsumed,
        gain: roundPaise(proceeds - costConsumed),
      });
      continue;
    }
    if (tx.units !== 0) {
      warnings.push(`${tx.date}: ${tx.txType} with units ${tx.units} has an unexpected sign — ignored.`);
    }
  }

  const unitsHeld = open.reduce((s, l) => s + l.units, 0);
  return {
    openLots: open,
    unitsHeld,
    investedCost: roundPaise(open.reduce((s, l) => s + l.cost, 0)),
    realized,
    realizedGainTotal: roundPaise(realized.reduce((s, r) => s + r.gain, 0)),
    chargesTotal,
    warnings,
  };
}
