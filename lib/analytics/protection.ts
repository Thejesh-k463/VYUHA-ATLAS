// Pure life-cover adequacy math. No DB, no React (AGENTS.md invariant 2).
//
// Needs-based method: cover should let the family settle every liability, fund
// every active goal, and replace `yearsOfExpenses` years of household spending,
// after counting the corpus that already exists. Every component is tagged with
// its basis so the screen can state exactly what is real data, what is an
// assumption the user controls, and what is a labeled rule of thumb. A missing
// input stays missing (null) — it is never silently treated as 0 (invariant 6).

export type ComponentBasis = "real-data" | "assumption" | "rule-of-thumb";

export interface AdequacyComponent {
  key: "liabilities" | "goals" | "expenses" | "assets";
  label: string;
  /** Rupees. null = the underlying data does not exist yet. */
  amount: number | null;
  /** +1 adds to required cover, −1 offsets it. */
  sign: 1 | -1;
  basis: ComponentBasis;
  detail: string;
}

export interface AdequacyInputs {
  /** Outstanding liabilities (loans at schedule + liability accounts), positive rupees. REAL. */
  liabilitiesTotal: number;
  /** Σ active goal targets inflated to their target dates, rupees. REAL. */
  goalTargetsInflated: number;
  /** Median monthly household burn from imported bank months; null when no bank data. REAL. */
  monthlyExpenses: number | null;
  /** Corpus that would be available to the family (MF value + known bank/liquid balances + trading equity). REAL. */
  countedAssets: number;
  /** Σ sum assured across active LIFE policies. REAL. */
  existingLifeCover: number;
  /** Years of expenses the cover should replace. ASSUMPTION (user-editable). */
  yearsOfExpenses: number;
  /** Annual income as stated by the user; null = not stated. ASSUMPTION. */
  annualIncome: number | null;
  /** Income multiple for the rule-of-thumb cross-check. RULE OF THUMB. */
  incomeMultiple: number;
}

export interface AdequacyResult {
  components: AdequacyComponent[];
  /** Σ of available signed components, floored at 0. Meaningful only with `incomplete` in view. */
  requiredCover: number;
  /** true when any needs component is missing — the total is then a LOWER BOUND. */
  incomplete: boolean;
  missing: AdequacyComponent["key"][];
  existingLifeCover: number;
  /** requiredCover − existingLifeCover; negative = surplus. */
  gap: number;
  /** Income-multiple cross-check. null unless the user has stated an income. */
  ruleOfThumb: { requiredCover: number; gap: number; multiple: number } | null;
}

export function lifeAdequacy(inp: AdequacyInputs): AdequacyResult {
  const components: AdequacyComponent[] = [
    {
      key: "liabilities",
      label: "Settle outstanding liabilities",
      amount: inp.liabilitiesTotal,
      sign: 1,
      basis: "real-data",
      detail: "Loans at amortization schedule plus liability accounts, from your mapped accounts.",
    },
    {
      key: "goals",
      label: "Fund active goals (inflated targets)",
      amount: inp.goalTargetsInflated,
      sign: 1,
      basis: "real-data",
      detail: "Σ of each active goal's target inflated to its target date, from /goals.",
    },
    {
      key: "expenses",
      label: `Replace ${inp.yearsOfExpenses} years of household expenses`,
      amount: inp.monthlyExpenses === null ? null : inp.monthlyExpenses * 12 * inp.yearsOfExpenses,
      sign: 1,
      basis: "assumption",
      detail:
        inp.monthlyExpenses === null
          ? "No imported bank months yet — this component is MISSING, not zero. Import statements to ground it."
          : `Median monthly burn from your imported bank months × 12 × ${inp.yearsOfExpenses} years (years is your editable assumption).`,
    },
    {
      key: "assets",
      label: "Less: corpus already available",
      amount: inp.countedAssets,
      sign: -1,
      basis: "real-data",
      detail:
        "Mutual funds + known account balances (property excluded — the family lives in it) + trading equity: money already available.",
    },
  ];

  const missing = components.filter((c) => c.amount === null).map((c) => c.key);
  const sum = components.reduce((acc, c) => acc + (c.amount === null ? 0 : c.sign * c.amount), 0);
  const requiredCover = Math.max(0, sum);
  const gap = requiredCover - inp.existingLifeCover;

  const ruleOfThumb =
    inp.annualIncome === null
      ? null
      : {
          requiredCover: inp.annualIncome * inp.incomeMultiple,
          gap: inp.annualIncome * inp.incomeMultiple - inp.existingLifeCover,
          multiple: inp.incomeMultiple,
        };

  return {
    components,
    requiredCover,
    incomplete: missing.length > 0,
    missing,
    existingLifeCover: inp.existingLifeCover,
    gap,
    ruleOfThumb,
  };
}
