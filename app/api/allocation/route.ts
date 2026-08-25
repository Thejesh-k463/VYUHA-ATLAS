import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSET_CLASSES } from "@/lib/db/schema";
import { setAllocationTargets } from "@/lib/queries/investments";

const body = z.object({
  targets: z
    .array(
      z.object({
        assetClass: z.enum(ASSET_CLASSES),
        targetPct: z.number().min(0).max(100),
        driftBandPct: z.number().min(0.5).max(50),
      }),
    )
    .max(ASSET_CLASSES.length),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const seen = new Set<string>();
  for (const t of parsed.data.targets) {
    if (seen.has(t.assetClass)) {
      return NextResponse.json({ error: `Duplicate target for ${t.assetClass}.` }, { status: 400 });
    }
    seen.add(t.assetClass);
  }
  const sum = parsed.data.targets.reduce((s, t) => s + t.targetPct, 0);
  if (parsed.data.targets.length > 0 && Math.abs(sum - 100) > 0.01) {
    return NextResponse.json({ error: `Targets must sum to 100% (got ${sum.toFixed(2)}%).` }, { status: 422 });
  }
  setAllocationTargets(parsed.data.targets);
  return NextResponse.json({ saved: parsed.data.targets.length });
}
