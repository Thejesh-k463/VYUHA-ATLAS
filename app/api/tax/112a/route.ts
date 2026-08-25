import { NextResponse } from "next/server";
import { get112aCsv } from "@/lib/queries/tax";

export async function GET(req: Request) {
  const fy = new URL(req.url).searchParams.get("fy");
  if (!fy || !/^\d{4}-\d{2}$/.test(fy)) {
    return NextResponse.json({ error: "fy required, e.g. ?fy=2025-26" }, { status: 400 });
  }
  const result = get112aCsv(fy);
  if (!result.ok) {
    // Never hand out a file the portal would choke on.
    return NextResponse.json(
      { error: "Generated CSV failed portal validation — not emitted.", violations: result.violations },
      { status: 500 },
    );
  }
  if (result.rows === 0) {
    return NextResponse.json({ error: `No equity LTCG legs in FY ${fy}.` }, { status: 404 });
  }
  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-112a-fy${fy}.csv"`,
    },
  });
}
