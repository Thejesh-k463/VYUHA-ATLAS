import { NextResponse } from "next/server";
import { z } from "zod";
import { extractCasPdfLines } from "@/lib/import/cas-pdf";
import { parseCasText } from "@/lib/import/cas-parse";
import { replaceCasFacts } from "@/lib/queries/investments";
import { roundPaise } from "@/lib/domain/money";

// The CAS password never touches the DB or any log — it decrypts the PDF in
// memory and is gone when this handler returns.
const body = z.object({
  fileName: z.string().nullish(),
  pdfBase64: z.string().min(1),
  password: z.string().nullish(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  let data: Uint8Array;
  try {
    data = new Uint8Array(Buffer.from(parsed.data.pdfBase64, "base64"));
  } catch {
    return NextResponse.json({ error: "pdfBase64 is not valid base64." }, { status: 400 });
  }
  const extracted = await extractCasPdfLines(data, parsed.data.password ?? undefined);
  if (!extracted.ok) {
    return NextResponse.json(
      { error: extracted.error, needsPassword: extracted.needsPassword ?? false },
      { status: 422 },
    );
  }
  const result = parseCasText(extracted.lines);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  const counts = replaceCasFacts(result, parsed.data.fileName ?? null);

  // Reconciliation against the CAS's own summary — reported, never silently trusted.
  const costSum = roundPaise(result.holdings.reduce((s, h) => s + (h.costValue ?? 0), 0));
  const marketSum = roundPaise(result.holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0));
  const summary = result.statement.summaryTotal;
  return NextResponse.json({
    holdings: counts.holdings,
    transactions: counts.transactions,
    periodFrom: result.statement.periodFrom,
    periodTo: result.statement.periodTo,
    pageCount: extracted.pageCount,
    warnings: result.warnings,
    reconciliation: summary
      ? {
          casCost: summary.cost,
          casMarket: summary.market,
          parsedCost: costSum,
          parsedMarket: marketSum,
          costMatches: Math.abs(summary.cost - costSum) < 0.01,
          marketMatches: Math.abs(summary.market - marketSum) < 0.01,
        }
      : null,
  });
}
