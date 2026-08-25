import { NextResponse } from "next/server";
import { z } from "zod";
import { NOMINEE_ASSET_TYPES } from "@/lib/db/schema";
import { addNominee, deleteNominee } from "@/lib/queries/protection";

const postBody = z.object({
  assetType: z.enum(NOMINEE_ASSET_TYPES),
  refId: z.number().int().min(0),
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().max(80).nullish(),
  sharePct: z.number().min(0).max(100).nullish(),
});

export async function POST(req: Request) {
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid nominee payload." }, { status: 400 });
  }
  return NextResponse.json({ id: addNominee(parsed.data) });
}

export async function DELETE(req: Request) {
  const parsed = z
    .object({ id: z.number().int().positive() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid delete payload." }, { status: 400 });
  }
  deleteNominee(parsed.data.id);
  return NextResponse.json({ ok: true });
}
