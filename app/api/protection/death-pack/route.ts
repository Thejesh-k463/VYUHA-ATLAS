import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDeathPackHtml, encryptDeathPack } from "@/lib/export/death-pack";
import { buildDeathPackPayload } from "@/lib/queries/protection";

// The plaintext payload exists ONLY in this handler's memory — it is encrypted
// before anything leaves the process, and nothing is ever written to disk.

const body = z.object({
  passphrase: z.string().min(8, "Use at least 8 characters."),
  confirm: z.string(),
});

function scryptLibSource(): string {
  // Local-first app, always run from the project dir (dev/start scripts).
  return fs.readFileSync(path.join(process.cwd(), "node_modules", "scrypt-js", "scrypt.js"), "utf8");
}

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 });
  }
  if (parsed.data.passphrase !== parsed.data.confirm) {
    return NextResponse.json({ error: "Passphrases do not match." }, { status: 400 });
  }

  let lib: string;
  try {
    lib = scryptLibSource();
  } catch {
    return NextResponse.json({ error: "scrypt-js not found in node_modules — run npm install." }, { status: 500 });
  }

  const now = new Date();
  const payload = buildDeathPackPayload(now.toISOString().slice(0, 10), now.toISOString());
  const envelope = encryptDeathPack(Buffer.from(JSON.stringify(payload), "utf8"), parsed.data.passphrase);
  const html = buildDeathPackHtml(envelope, lib);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="atlas-estate-pack-${now.toISOString().slice(0, 10)}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
