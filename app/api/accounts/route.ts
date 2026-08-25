import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCOUNT_KINDS, OWNERS } from "@/lib/db/schema";
import { createAccount } from "@/lib/queries/accounts";

const body = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(ACCOUNT_KINDS),
  category: z.enum(["asset", "liability"]),
  owner: z.enum(OWNERS),
  openingBalance: z.number().finite().optional(),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid account payload." }, { status: 400 });
  }
  const id = createAccount(parsed.data);
  return NextResponse.json({ id });
}
