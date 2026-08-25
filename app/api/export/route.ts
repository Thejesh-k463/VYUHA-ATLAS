import { NextResponse } from "next/server";
import { getSqlite } from "@/lib/db";

const TABLES = [
  "accounts",
  "balance_snapshots",
  "loans",
  "trading_periods",
  "trading_segments",
  "trading_charges",
  "trading_open_positions",
  "trading_capital",
  "trading_cashflows",
  "import_batches",
] as const;

function rows(table: string): Record<string, unknown>[] {
  return getSqlite().prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
}

function toCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";
  const cols = Object.keys(data[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...data.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** Open-format export (archival contract): raw DB values — *_paise columns are
 *  INTEGER PAISE here, unlike runtime rupees. Stated in the payload so a file
 *  read in 2036 explains itself. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const table = url.searchParams.get("table");
  const stamp = new Date().toISOString().slice(0, 10);

  if (table) {
    if (!(TABLES as readonly string[]).includes(table)) {
      return NextResponse.json({ error: `Unknown table. One of: ${TABLES.join(", ")}` }, { status: 400 });
    }
    return new NextResponse(toCsv(rows(table)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="atlas-${table}-${stamp}.csv"`,
      },
    });
  }

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    tables[t] = rows(t);
    counts[t] = tables[t].length;
  }
  return new NextResponse(
    JSON.stringify(
      { atlasExport: true, version: 1, exportedAt: new Date().toISOString(), units: "money columns are integer paise", counts, tables },
      null,
      1,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="atlas-export-${stamp}.json"`,
      },
    },
  );
}
