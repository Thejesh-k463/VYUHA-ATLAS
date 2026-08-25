import { NextResponse } from "next/server";
import { z } from "zod";
import { setTransactionCategory } from "@/lib/queries/expenses";

const body = z.object({
  id: z.number().int().positive(),
  category: z.string().trim().min(1).max(60).nullable(),
});

export async function PATCH(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  setTransactionCategory(parsed.data.id, parsed.data.category);
  return NextResponse.json({ ok: true });
}
