import { NextResponse } from "next/server";
import { z } from "zod";
import { parseVyuhaEnvelope } from "@/lib/import/vyuha-envelope";
import { replaceVyuhaFacts } from "@/lib/queries/trading";

const body = z.object({
  fileName: z.string().nullish(),
  envelope: z.unknown(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const result = parseVyuhaEnvelope(parsed.data.envelope);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }
  replaceVyuhaFacts(result.facts, parsed.data.fileName ?? null);
  return NextResponse.json({
    periods: result.facts.periods.length,
    cashflows: result.facts.cashflows.length,
    closedTrades: result.facts.closedTradeCount,
    openTrades: result.facts.openTradeCount,
    skippedTradeRows: result.facts.skippedTradeRows,
    skippedLedgerRows: result.facts.skippedLedgerRows,
  });
}
