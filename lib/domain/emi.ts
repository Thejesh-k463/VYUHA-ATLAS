// Pure EMI / amortization math. All money in rupees.

export interface LoanTerms {
  principal: number; // rupees
  annualRatePct: number; // e.g. 8.5
  tenureMonths: number;
  startDate: string; // ISO yyyy-mm-dd of first EMI month
}

/** Standard EMI formula. Zero-rate loans degrade to straight-line. */
export function computeEmi(principal: number, annualRatePct: number, tenureMonths: number): number {
  if (tenureMonths <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / tenureMonths;
  const f = Math.pow(1 + r, tenureMonths);
  return (principal * r * f) / (f - 1);
}

export interface AmortRow {
  monthIndex: number; // 1-based
  interest: number;
  principalPaid: number;
  outstanding: number;
}

export function amortizationSchedule(terms: LoanTerms): AmortRow[] {
  const emi = computeEmi(terms.principal, terms.annualRatePct, terms.tenureMonths);
  const r = terms.annualRatePct / 12 / 100;
  const rows: AmortRow[] = [];
  let outstanding = terms.principal;
  for (let m = 1; m <= terms.tenureMonths; m++) {
    const interest = outstanding * r;
    // Final EMI absorbs rounding drift so the loan closes at exactly zero.
    const principalPaid = m === terms.tenureMonths ? outstanding : emi - interest;
    outstanding = Math.max(0, outstanding - principalPaid);
    rows.push({ monthIndex: m, interest, principalPaid, outstanding });
  }
  return rows;
}

/** Months elapsed from the first-EMI month to asOf (same month => 0 EMIs paid). */
export function emisPaidBy(startDate: string, asOf: string): number {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ay, am] = asOf.split("-").map(Number);
  return Math.max(0, (ay - sy) * 12 + (am - sm));
}

/** Outstanding principal after the EMIs due strictly before asOf month. */
export function outstandingAt(terms: LoanTerms, asOf: string): number {
  const paid = Math.min(emisPaidBy(terms.startDate, asOf), terms.tenureMonths);
  if (paid === 0) return terms.principal;
  const schedule = amortizationSchedule(terms);
  return schedule[paid - 1].outstanding;
}
