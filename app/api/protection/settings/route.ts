import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProtectionSettings } from "@/lib/queries/protection";

const patchBody = z.object({
  yearsOfExpenses: z.number().min(0).max(60).optional(),
  annualIncome: z.number().positive().max(10_000_000_000).nullable().optional(),
  incomeMultiple: z.number().min(1).max(50).optional(),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        relation: z.string().trim().max(80).default(""),
        phone: z.string().trim().max(40).default(""),
        note: z.string().trim().max(200).default(""),
      }),
    )
    .max(20)
    .optional(),
  instructions: z.string().max(4000).optional(),
});

export async function PATCH(req: Request) {
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }
  updateProtectionSettings(parsed.data);
  return NextResponse.json({ ok: true });
}
