import { NextResponse } from "next/server";
import { z } from "zod";
import { addCarryForward, deleteCarryForward } from "@/lib/queries/tax";

const postBody = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/),
  lossType: z.enum(["stcl", "ltcl", "fno", "speculative"]),
  amount: z.number().positive().max(10_000_000_000),
  note: z.string().trim().max(300).nullish(),
});

export async function POST(req: Request) {
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const { fy, lossType, amount, note } = parsed.data;
  return NextResponse.json({ id: addCarryForward(fy, lossType, amount, note ?? null) });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }
  deleteCarryForward(id);
  return NextResponse.json({ deleted: id });
}
