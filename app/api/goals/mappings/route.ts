import { NextResponse } from "next/server";
import { z } from "zod";
import { GOAL_ASSET_TYPES } from "@/lib/db/schema";
import { addMapping, deleteMapping } from "@/lib/queries/goals";

const postBody = z.object({
  goalId: z.number().int().positive(),
  assetType: z.enum(GOAL_ASSET_TYPES),
  refId: z.number().int().min(0),
  sharePct: z.number().gt(0).max(100),
});

export async function POST(req: Request) {
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mapping payload." }, { status: 400 });
  }
  const { goalId, assetType, refId, sharePct } = parsed.data;
  return NextResponse.json({ id: addMapping(goalId, assetType, refId, sharePct) });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }
  deleteMapping(id);
  return NextResponse.json({ deleted: id });
}
