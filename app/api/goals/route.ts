import { NextResponse } from "next/server";
import { z } from "zod";
import { createGoal, deleteGoal, updateGoal } from "@/lib/queries/goals";

const goalFields = {
  name: z.string().trim().min(1).max(120),
  targetAmount: z.number().positive().max(10_000_000_000),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inflationPct: z.number().min(0).max(30),
  expectedReturnPct: z.number().min(0).max(30),
  volatilityPct: z.number().min(0).max(60),
};

const postBody = z.object({
  ...goalFields,
  inflationPct: goalFields.inflationPct.default(6),
  expectedReturnPct: goalFields.expectedReturnPct.default(11),
  volatilityPct: goalFields.volatilityPct.default(14),
});

export async function POST(req: Request) {
  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid goal payload." }, { status: 400 });
  }
  return NextResponse.json({ id: createGoal(parsed.data) });
}

const patchBody = z.object({
  id: z.number().int().positive(),
  name: goalFields.name.optional(),
  targetAmount: goalFields.targetAmount.optional(),
  targetDate: goalFields.targetDate.optional(),
  inflationPct: goalFields.inflationPct.optional(),
  expectedReturnPct: goalFields.expectedReturnPct.optional(),
  volatilityPct: goalFields.volatilityPct.optional(),
});

export async function PATCH(req: Request) {
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid goal payload." }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  updateGoal(id, clean);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id required." }, { status: 400 });
  }
  deleteGoal(id);
  return NextResponse.json({ deleted: id });
}
