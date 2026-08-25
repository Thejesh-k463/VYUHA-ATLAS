import { NextResponse } from "next/server";
import { z } from "zod";
import { INSURANCE_KINDS, OWNERS, PREMIUM_FREQUENCIES } from "@/lib/db/schema";
import { createPolicy, deletePolicy, updatePolicy } from "@/lib/queries/protection";

const policyFields = {
  kind: z.enum(INSURANCE_KINDS),
  insurer: z.string().trim().min(1).max(120),
  policyNo: z.string().trim().min(1).max(80),
  planName: z.string().trim().max(160).nullish(),
  sumAssured: z.number().positive().max(10_000_000_000),
  premium: z.number().min(0).max(1_000_000_000),
  premiumFrequency: z.enum(PREMIUM_FREQUENCIES),
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  owner: z.enum(OWNERS).default("self"),
  note: z.string().trim().max(500).nullish(),
};

export async function POST(req: Request) {
  const parsed = z.object(policyFields).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy payload." }, { status: 400 });
  }
  return NextResponse.json({ id: createPolicy(parsed.data) });
}

const patchBody = z.object({
  id: z.number().int().positive(),
  kind: policyFields.kind.optional(),
  insurer: policyFields.insurer.optional(),
  policyNo: policyFields.policyNo.optional(),
  planName: policyFields.planName.optional(),
  sumAssured: policyFields.sumAssured.optional(),
  premium: policyFields.premium.optional(),
  premiumFrequency: policyFields.premiumFrequency.optional(),
  renewalDate: policyFields.renewalDate.optional(),
  startDate: policyFields.startDate.optional(),
  owner: z.enum(OWNERS).optional(),
  note: policyFields.note.optional(),
});

export async function PATCH(req: Request) {
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy payload." }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  updatePolicy(id, clean);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const parsed = z
    .object({ id: z.number().int().positive() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid delete payload." }, { status: 400 });
  }
  deletePolicy(parsed.data.id);
  return NextResponse.json({ ok: true });
}
