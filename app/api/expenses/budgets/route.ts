import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteBudget, setBudget } from "@/lib/queries/expenses";

const postBody = z.object({
  category: z.string().trim().min(1).max(60),
  monthlyLimit: z.number().positive().max(100_000_000),
});

export async function POST(req: Request) {
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  setBudget(parsed.data.category, parsed.data.monthlyLimit);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }
  deleteBudget(id);
  return NextResponse.json({ deleted: id });
}
