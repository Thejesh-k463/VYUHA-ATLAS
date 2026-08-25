import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSET_CLASSES, OWNERS } from "@/lib/db/schema";
import { updateHolding } from "@/lib/queries/investments";

const body = z.object({
  id: z.number().int().positive(),
  assetClass: z.enum(ASSET_CLASSES).optional(),
  owner: z.enum(OWNERS).optional(),
});

export async function PATCH(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  updateHolding(id, patch);
  return NextResponse.json({ ok: true });
}
