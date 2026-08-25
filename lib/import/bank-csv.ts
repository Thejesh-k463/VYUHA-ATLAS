// Pure bank-statement CSV parser: text → mapped, typed rows + rejected rows.
// No DB, no React (invariant 2). The phase-3 gate lives here: an unreadable
// date or amount REJECTS the row with a reason — it is never coerced to 0
// (invariant 6). Rejections are reported, not swallowed.

export type Delimiter = "," | ";" | "\t";

/** RFC-4180-ish CSV: quoted fields, escaped quotes, CR/LF tolerant. */
export function parseCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows (bank exports love trailing blanks).
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function sniffDelimiter(text: string): Delimiter {
  const head = text.split(/\r?\n/).slice(0, 30).join("\n");
  const counts: [Delimiter, number][] = ([",", ";", "\t"] as Delimiter[]).map((d) => [
    d,
    (head.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export type DateFormat = "dmy" | "mdy" | "ymd" | "dMonY";

export interface ColumnMapping {
  date: number;
  description: number;
  /** Single amount column (signed, or with Dr/Cr suffix)… */
  amount?: number;
  /** …or split debit/credit columns. Exactly one style must be present. */
  debit?: number;
  credit?: number;
  balance?: number;
  dateFormat: DateFormat;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null; // 31-Feb style
  return iso;
}

/** Parse one date cell under a specific format; null = unreadable (→ reject). */
export function parseDateCell(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (format === "dMonY") {
    const m = /^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{2,4})$/.exec(s);
    if (!m) return null;
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(year, month, Number(m[1]));
  }
  const m = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/.exec(s);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (format === "ymd") return m[1].length === 4 ? validYmd(a, b, c) : null;
  const year = m[3].length === 2 ? 2000 + c : c;
  if (m[3].length !== 2 && m[3].length !== 4) return null;
  return format === "dmy" ? validYmd(year, b, a) : validYmd(year, a, b);
}

/** Amount cell → signed rupees. Handles commas, ₹, parentheses, Dr/Cr tags. Null = unreadable. */
export function parseAmountCell(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let sign = 1;
  const paren = s.startsWith("(") && s.endsWith(")");
  if (paren) s = s.slice(1, -1).trim();
  const drcr = /(dr|cr)\.?$|^(dr|cr)\.?\s/i.exec(s);
  if (drcr) {
    const tag = (drcr[1] ?? drcr[2]).toLowerCase();
    if (tag === "dr") sign = -1;
    s = s.replace(/(dr|cr)\.?$/i, "").replace(/^(dr|cr)\.?\s/i, "").trim();
  }
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1);
  }
  s = s.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return (paren ? -1 : 1) * sign * n;
}

// Header keyword sets, lowercase. Indian-bank vocabulary (HDFC/ICICI/SBI/Axis/Kotak…).
const HEADER_HINTS = {
  date: ["date", "txn date", "transaction date", "value date", "tran date", "value dt"],
  description: ["narration", "description", "particulars", "details", "remarks", "transaction remarks", "transaction details"],
  debit: ["debit", "withdrawal", "withdrawal amt", "withdrawal amount", "dr amount", "debit amount", "withdrawals"],
  credit: ["credit", "deposit", "deposit amt", "deposit amount", "cr amount", "credit amount", "deposits"],
  amount: ["amount", "transaction amount", "amount (inr)"],
  balance: ["balance", "closing balance", "available balance", "running balance", "balance amt"],
} as const;

function matchHeader(cell: string, hints: readonly string[]): boolean {
  const c = cell.trim().toLowerCase().replace(/[.()]/g, "").replace(/\s+/g, " ");
  return hints.some((h) => c === h || c.startsWith(h) || c.includes(h));
}

export interface DetectedLayout {
  headerIndex: number;
  headers: string[];
  mapping: ColumnMapping;
}

/** Find the header row (banks prepend preamble junk) and map columns. */
export function detectLayout(rows: string[][]): DetectedLayout | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    const find = (hints: readonly string[]) => row.findIndex((c) => matchHeader(c, hints));
    const date = find(HEADER_HINTS.date);
    if (date === -1) continue;
    const description = find(HEADER_HINTS.description);
    if (description === -1) continue;
    const debit = find(HEADER_HINTS.debit);
    const credit = find(HEADER_HINTS.credit);
    // "amount" must not accidentally grab a debit/credit/balance column.
    const amount = row.findIndex(
      (c, idx) => idx !== debit && idx !== credit && !matchHeader(c, HEADER_HINTS.balance) && !matchHeader(c, HEADER_HINTS.debit) && !matchHeader(c, HEADER_HINTS.credit) && matchHeader(c, HEADER_HINTS.amount),
    );
    const balance = find(HEADER_HINTS.balance);
    const hasSplit = debit !== -1 && credit !== -1;
    const hasSingle = amount !== -1;
    if (!hasSplit && !hasSingle) continue;
    const dateFormat = detectDateFormat(rows.slice(i + 1), date);
    if (!dateFormat) continue;
    return {
      headerIndex: i,
      headers: row.map((h) => h.trim()),
      mapping: {
        date,
        description,
        ...(hasSplit ? { debit, credit } : { amount }),
        ...(balance !== -1 ? { balance } : {}),
        dateFormat,
      },
    };
  }
  return null;
}

/** Choose the date format most of the data satisfies — majority vote, because
 *  real statements carry footer junk in the date column ("STATEMENT SUMMARY").
 *  Indian statements are day-first, so dmy wins ties; mdy only when the data
 *  rules dmy out. Junk rows lose the vote and later reject row-by-row. */
export function detectDateFormat(dataRows: string[][], dateCol: number): DateFormat | null {
  const samples = dataRows
    .map((r) => (r[dateCol] ?? "").trim())
    .filter((s) => s !== "")
    .slice(0, 60);
  if (samples.length === 0) return null;
  let best: DateFormat | null = null;
  let bestCount = 0;
  for (const fmt of ["dMonY", "ymd", "dmy", "mdy"] as DateFormat[]) {
    const count = samples.filter((s) => parseDateCell(s, fmt) !== null).length;
    if (count > bestCount) {
      best = fmt;
      bestCount = count;
    }
  }
  return best;
}

export interface ParsedBankRow {
  date: string; // ISO
  description: string;
  amount: number; // signed rupees, debit negative
  balance: number | null;
}

export interface RejectedRow {
  rowNumber: number; // 1-based within the file, after the header
  reason: string;
  raw: string;
}

export interface BankCsvResult {
  ok: true;
  rows: ParsedBankRow[];
  rejected: RejectedRow[];
  layout: DetectedLayout;
}
export interface BankCsvError {
  ok: false;
  error: string;
}

export function parseBankCsv(text: string, mappingOverride?: Partial<ColumnMapping>): BankCsvResult | BankCsvError {
  const delimiter = sniffDelimiter(text);
  const grid = parseCsv(text, delimiter);
  if (grid.length < 2) return { ok: false, error: "That file has no data rows." };
  const detected = detectLayout(grid);
  if (!detected) {
    return {
      ok: false,
      error:
        "Could not find a header row with date, narration and amount (or debit/credit) columns. Export the statement as CSV/Excel-CSV from netbanking and retry.",
    };
  }
  const mapping: ColumnMapping = { ...detected.mapping, ...mappingOverride };
  const rows: ParsedBankRow[] = [];
  const rejected: RejectedRow[] = [];

  for (let i = detected.headerIndex + 1; i < grid.length; i++) {
    const row = grid[i];
    const raw = row.join(delimiter === "\t" ? "\t" : delimiter);
    const rowNumber = i + 1;
    const reject = (reason: string) => rejected.push({ rowNumber, reason, raw });

    const dateRaw = (row[mapping.date] ?? "").trim();
    const desc = (row[mapping.description] ?? "").trim();
    // Footer junk ("Opening balance", "Total", legends) has no parseable date — reject silently-numbered.
    const date = parseDateCell(dateRaw, mapping.dateFormat);
    if (!date) {
      reject(dateRaw === "" ? "empty date" : `unreadable date "${dateRaw}"`);
      continue;
    }
    if (!desc) {
      reject("empty description");
      continue;
    }

    let amount: number | null = null;
    if (mapping.debit !== undefined && mapping.credit !== undefined) {
      const dRaw = (row[mapping.debit] ?? "").trim();
      const cRaw = (row[mapping.credit] ?? "").trim();
      const d = parseAmountCell(dRaw);
      const c = parseAmountCell(cRaw);
      const dEmpty = dRaw === "" || d === 0;
      const cEmpty = cRaw === "" || c === 0;
      if (dRaw !== "" && d === null) {
        reject(`unreadable debit "${dRaw}"`);
        continue;
      }
      if (cRaw !== "" && c === null) {
        reject(`unreadable credit "${cRaw}"`);
        continue;
      }
      if (dEmpty && cEmpty) {
        reject("no amount in either debit or credit");
        continue;
      }
      if (!dEmpty && !cEmpty) {
        reject("both debit and credit filled");
        continue;
      }
      amount = dEmpty ? Math.abs(c!) : -Math.abs(d!);
    } else if (mapping.amount !== undefined) {
      const aRaw = (row[mapping.amount] ?? "").trim();
      const a = parseAmountCell(aRaw);
      if (a === null) {
        reject(aRaw === "" ? "empty amount" : `unreadable amount "${aRaw}"`);
        continue;
      }
      amount = a;
    } else {
      reject("mapping has neither amount nor debit/credit columns");
      continue;
    }

    let balance: number | null = null;
    if (mapping.balance !== undefined) {
      balance = parseAmountCell((row[mapping.balance] ?? "").trim());
      // an unreadable balance never rejects the row — balance is auxiliary and stays null
    }
    rows.push({ date, description: desc, amount, balance });
  }

  if (rows.length === 0) {
    return { ok: false, error: "Every data row was unreadable — check the column mapping." };
  }
  return { ok: true, rows, rejected, layout: { ...detected, mapping } };
}
