// Pure Schedule 112A CSV generator + validator (the phase-5 gate).
// No DB, no React.
//
// Target: the e-filing portal's Schedule 112A CSV template. Portal rules the
// validator enforces (ROADMAP gate):
//   - dates are DD/MM/YYYY,
//   - "Share/Unit acquired" is the code AE (acquired on/after 01-Feb-2018)
//     or BE (before 01-Feb-2018),
//   - NO commas anywhere (the portal parser is comma-naive: no thousand
//     separators, no commas in names),
//   - ISIN is 12 chars [A-Z0-9], numerics plain with dot decimals.
// Column set follows the AY 2024-25 template; verify against the portal's
// current template before filing — the header row is data here, not law.

import { roundPaise } from "@/lib/domain/money";
import type { MfGainLeg } from "@/lib/tax/capital-gains";

export const S112A_HEADERS = [
  "Share/Unit Acquired",
  "ISIN Code",
  "Name of the Share/Unit",
  "No. of Shares/Units",
  "Sale-price per Share/Unit",
  "Full Value of Consideration",
  "Cost of Acquisition",
  "FMV per share/unit as on 31-Jan-2018",
  "Total Fair Market Value",
  "Expenditure in connection with transfer",
  "Date of Sale/Transfer",
] as const;

const GRANDFATHER_DATE = "2018-02-01";

/** "2026-03-19" → "19/03/2026" */
export function toPortalDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function sanitizeName(name: string): string {
  return name.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

export function generate112aCsv(ltcgLegs: MfGainLeg[]): string {
  const lines: string[] = [S112A_HEADERS.join(",")];
  for (const leg of ltcgLegs) {
    const code = leg.lotDate >= GRANDFATHER_DATE ? "AE" : "BE";
    const salePricePerUnit = leg.units > 0 ? leg.proceeds / leg.units : 0;
    lines.push(
      [
        code,
        leg.isin,
        sanitizeName(leg.schemeName),
        leg.units.toFixed(3),
        salePricePerUnit.toFixed(4),
        roundPaise(leg.proceeds).toFixed(2),
        roundPaise(leg.cost).toFixed(2),
        code === "AE" ? "0" : "", // FMV per unit only for BE rows — this codebase has none pre-2018
        code === "AE" ? "0" : "",
        "0.00",
        toPortalDate(leg.sellDate),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

export interface S112aViolation {
  line: number; // 1-based, header = 1
  field: string;
  problem: string;
}

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const ISIN_RE = /^[A-Z0-9]{12}$/;
const NUM_RE = /^-?\d+(\.\d+)?$|^$|^0$/;

/** Portal-rule validator — used in tests AND run over every generated file. */
export function validate112aCsv(csv: string): S112aViolation[] {
  const violations: S112aViolation[] = [];
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [{ line: 1, field: "file", problem: "empty file" }];
  const headerCols = lines[0].split(",");
  if (headerCols.length !== S112A_HEADERS.length) {
    violations.push({
      line: 1,
      field: "header",
      problem: `expected ${S112A_HEADERS.length} columns, found ${headerCols.length}`,
    });
  }
  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;
    const cols = lines[i].split(",");
    if (cols.length !== S112A_HEADERS.length) {
      violations.push({
        line,
        field: "row",
        problem: `expected ${S112A_HEADERS.length} fields, found ${cols.length} — a comma inside a value breaks the portal parser`,
      });
      continue;
    }
    const [code, isin, name, units, pricePerUnit, consideration, cost, fmvUnit, fmvTotal, expenditure, saleDate] = cols;
    if (code !== "AE" && code !== "BE") {
      violations.push({ line, field: "Share/Unit Acquired", problem: `"${code}" is not AE or BE` });
    }
    if (!ISIN_RE.test(isin)) {
      violations.push({ line, field: "ISIN Code", problem: `"${isin}" is not a 12-char ISIN` });
    }
    if (name.trim() === "") {
      violations.push({ line, field: "Name", problem: "empty" });
    }
    for (const [field, v] of [
      ["No. of Shares/Units", units],
      ["Sale-price per Share/Unit", pricePerUnit],
      ["Full Value of Consideration", consideration],
      ["Cost of Acquisition", cost],
      ["FMV per unit", fmvUnit],
      ["Total FMV", fmvTotal],
      ["Expenditure", expenditure],
    ] as const) {
      if (!NUM_RE.test(v)) {
        violations.push({ line, field, problem: `"${v}" is not a plain number (no commas, dot decimals)` });
      }
    }
    if (!DATE_RE.test(saleDate)) {
      violations.push({ line, field: "Date of Sale/Transfer", problem: `"${saleDate}" is not DD/MM/YYYY` });
    } else {
      const [dd, mm] = [Number(saleDate.slice(0, 2)), Number(saleDate.slice(3, 5))];
      if (dd < 1 || dd > 31 || mm < 1 || mm > 12) {
        violations.push({ line, field: "Date of Sale/Transfer", problem: `"${saleDate}" is not a real date` });
      }
    }
    if (code === "BE" && fmvUnit.trim() === "") {
      violations.push({ line, field: "FMV per unit", problem: "BE rows must carry the 31-Jan-2018 FMV" });
    }
  }
  return violations;
}
