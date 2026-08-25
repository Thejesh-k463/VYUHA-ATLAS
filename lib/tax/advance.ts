// Pure tax estimate + advance-tax schedule. No DB, no React. Every rate and
// threshold arrives from the versioned config; assumptions are returned as
// text, never silently applied.

import { roundPaise } from "@/lib/domain/money";

export interface TaxEstimateInput {
  stcg111a: number; // equity STCG (MF + delivery), this FY
  ltcg112a: number; // equity LTCG before exemption
  slabIncome: number; // debt-MF gains + F&O net (when positive), taxed at slab
  stcgRatePct: number;
  ltcgRatePct: number;
  ltcgExemption: number;
  slabRatePct: number;
  cessPct: number;
}

export interface TaxEstimate {
  stcgTax: number;
  ltcgTaxable: number;
  ltcgTax: number;
  slabTax: number;
  subtotal: number;
  cess: number;
  total: number;
  notes: string[];
}

export function estimateTax(input: TaxEstimateInput): TaxEstimate {
  const notes: string[] = [];
  const stcgTax = input.stcg111a > 0 ? roundPaise((input.stcg111a * input.stcgRatePct) / 100) : 0;
  if (input.stcg111a < 0) notes.push("Equity STCG is a net loss — set off/carry forward, no tax here.");
  const ltcgTaxable = Math.max(0, input.ltcg112a - input.ltcgExemption);
  const ltcgTax = roundPaise((ltcgTaxable * input.ltcgRatePct) / 100);
  if (input.ltcg112a > 0 && ltcgTaxable === 0) {
    notes.push(`LTCG ₹${input.ltcg112a.toFixed(0)} is fully inside the ₹${input.ltcgExemption.toFixed(0)} s112A exemption.`);
  }
  if (input.ltcg112a < 0) notes.push("Equity LTCG is a net loss — set off/carry forward, no tax here.");
  const slabTax = input.slabIncome > 0 ? roundPaise((input.slabIncome * input.slabRatePct) / 100) : 0;
  if (input.slabIncome < 0) {
    notes.push("Slab-taxed bucket is a net loss — business/other-income set-off rules apply, not auto-applied here.");
  }
  if (slabTax > 0) notes.push(`Slab bucket taxed at the ASSUMED marginal rate ${input.slabRatePct}% — edit in tax settings.`);
  notes.push("Estimate covers investment/trading income only — salary, deductions and rebates are outside Atlas.");
  const subtotal = roundPaise(stcgTax + ltcgTax + slabTax);
  const cess = roundPaise((subtotal * input.cessPct) / 100);
  return {
    stcgTax,
    ltcgTaxable,
    ltcgTax,
    slabTax,
    subtotal,
    cess,
    total: roundPaise(subtotal + cess),
    notes,
  };
}

export interface InstallmentConfig {
  threshold: number;
  installments: { due: string; cumulativePct: number }[]; // due as "MM-DD"
}

export interface InstallmentRow {
  dueDate: string; // ISO
  cumulativePct: number;
  cumulativeDue: number;
  installment: number; // this tranche
}

/** s208/s211 schedule for `fy` ("2025-26"). Empty when liability < threshold. */
export function advanceSchedule(liability: number, fy: string, cfg: InstallmentConfig): InstallmentRow[] {
  if (liability < cfg.threshold) return [];
  const startYear = Number(fy.slice(0, 4));
  let prev = 0;
  return cfg.installments.map((inst) => {
    const [mm, dd] = inst.due.split("-").map(Number);
    const year = mm >= 4 ? startYear : startYear + 1;
    const cumulativeDue = roundPaise((liability * inst.cumulativePct) / 100);
    const row: InstallmentRow = {
      dueDate: `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
      cumulativePct: inst.cumulativePct,
      cumulativeDue,
      installment: roundPaise(cumulativeDue - prev),
    };
    prev = cumulativeDue;
    return row;
  });
}
