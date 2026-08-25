import { NextResponse } from "next/server";
import { z } from "zod";
import { addRule, applyRulesToExisting, deleteRule } from "@/lib/queries/expenses";

const postBody = z.object({
  pattern: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(60),
  priority: z.number().int().min(1).max(9999).default(100),
});

export async function POST(req: Request) {
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const id = addRule(parsed.data.pattern, parsed.data.category, parsed.data.priority);
  const recategorized = applyRulesToExisting();
  return NextResponse.json({ id, recategorized });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }
  deleteRule(id);
  const recategorized = applyRulesToExisting();
  return NextResponse.json({ deleted: id, recategorized });
}
