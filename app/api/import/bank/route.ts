import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBankCsv, type ColumnMapping } from "@/lib/import/bank-csv";
import { insertBankTransactions } from "@/lib/queries/expenses";

// dryRun=true → parse + report layout/samples/rejects, write nothing.
// The optional mapping override lets the user correct a mis-detected column.
const mappingSchema = z.object({
  date: z.number().int().min(0).optional(),
  description: z.number().int().min(0).optional(),
  amount: z.number().int().min(0).optional(),
  debit: z.number().int().min(0).optional(),
  credit: z.number().int().min(0).optional(),
  balance: z.number().int().min(0).optional(),
  dateFormat: z.enum(["dmy", "mdy", "ymd", "dMonY"]).optional(),
});

const body = z.object({
  accountId: z.number().int().positive(),
  csvText: z.string().min(1),
  fileName: z.string().nullish(),
  dryRun: z.boolean().optional(),
  mapping: mappingSchema.optional(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const result = parseBankCsv(parsed.data.csvText, parsed.data.mapping as Partial<ColumnMapping> | undefined);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  const rejectedSample = result.rejected.slice(0, 20);
  if (parsed.data.dryRun) {
    return NextResponse.json({
      dryRun: true,
      layout: result.layout,
      parsedCount: result.rows.length,
      rejectedCount: result.rejected.length,
      rejected: rejectedSample,
      sample: result.rows.slice(0, 5),
      dateRange:
        result.rows.length > 0
          ? {
              from: result.rows.reduce((a, r) => (r.date < a ? r.date : a), result.rows[0].date),
              to: result.rows.reduce((a, r) => (r.date > a ? r.date : a), result.rows[0].date),
            }
          : null,
    });
  }
  const outcome = insertBankTransactions(parsed.data.accountId, result.rows, parsed.data.fileName ?? null, {
    layout: result.layout,
    parsedCount: result.rows.length,
    rejectedCount: result.rejected.length,
  });
  return NextResponse.json({
    parsed: result.rows.length,
    inserted: outcome.inserted,
    duplicatesSkipped: outcome.duplicatesSkipped,
    categorized: outcome.categorized,
    balanceSnapshotDate: outcome.balanceSnapshotDate,
    rejectedCount: result.rejected.length,
    rejected: rejectedSample,
  });
}
