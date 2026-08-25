import fs from "node:fs";
import path from "node:path";
import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { syncScrypt } from "scrypt-js";
import {
  DEATH_PACK_KDF,
  buildDeathPackHtml,
  decryptDeathPack,
  encryptDeathPack,
  extractEnvelopeFromHtml,
  type DeathPackPayload,
} from "@/lib/export/death-pack";

const PAYLOAD: DeathPackPayload = {
  atlasDeathPack: true,
  v: 1,
  generatedAt: "2026-08-26T10:00:00.000Z",
  title: "atlas · estate pack",
  intro: "Everything mapped, for the family.",
  sections: [
    {
      title: "Insurance",
      items: [
        {
          label: "LIC-TEST-MARKER term plan",
          sub: "Policy 12345",
          fields: [
            ["Sum assured", "₹50,00,000"],
            ["Nominee", "SOMEONE"],
          ],
        },
      ],
    },
  ],
};
const PLAINTEXT = Buffer.from(JSON.stringify(PAYLOAD), "utf8");
const PASSPHRASE = "correct horse battery staple";

describe("death pack crypto (production params)", () => {
  // One encrypt shared across tests — each scrypt run at N=2^17 costs real time.
  const env = encryptDeathPack(PLAINTEXT, PASSPHRASE);

  it("uses the keyfile passphrase-mode scrypt params exactly", () => {
    expect(DEATH_PACK_KDF).toEqual({ algo: "scrypt", N: 1 << 17, r: 8, p: 1 });
    expect(env.kdf).toEqual(DEATH_PACK_KDF);
  });

  it("round-trips byte-identical", () => {
    const back = decryptDeathPack(env, PASSPHRASE);
    expect(Buffer.compare(back, PLAINTEXT)).toBe(0);
  });

  it("refuses a wrong passphrase outright (GCM auth) — no partial plaintext", () => {
    expect(() => decryptDeathPack(env, "wrong passphrase")).toThrow();
  });

  it("refuses a tampered ciphertext", () => {
    const ct = Buffer.from(env.ct, "base64");
    ct[0] ^= 0xff;
    expect(() => decryptDeathPack({ ...env, ct: ct.toString("base64") }, PASSPHRASE)).toThrow();
  });

  it("HTML embeds the envelope losslessly: extract → decrypt → byte-identical; no plaintext in the file", () => {
    const html = buildDeathPackHtml(env, "/* scrypt lib stub */");
    const extracted = extractEnvelopeFromHtml(html);
    expect(extracted).toEqual(env);
    const back = decryptDeathPack(extracted!, PASSPHRASE);
    expect(Buffer.compare(back, PLAINTEXT)).toBe(0);
    expect(html).not.toContain("LIC-TEST-MARKER"); // nothing readable without the passphrase
    expect(html).not.toContain("50,00,000");
  });
});

describe("browser/node scrypt compatibility pin", () => {
  it("scrypt-js (embedded in the HTML) derives the same key as node's scrypt", () => {
    // Same r/p as production; smaller N so the pure-JS run stays fast — the
    // algorithm match is parameter-independent.
    const salt = Buffer.from("0123456789abcdef");
    const pw = Buffer.from(PASSPHRASE.normalize("NFC"), "utf8");
    const js = Buffer.from(syncScrypt(pw, salt, 1 << 14, 8, 1, 32));
    const node = scryptSync(pw, salt, 32, { N: 1 << 14, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
    expect(js.equals(node)).toBe(true);
  });
});

describe("no plaintext death pack ever touches disk", () => {
  it("the module is fs-free (route streams from memory)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "export", "death-pack.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']node:fs["']|require\(["']fs["']\)|from\s+["']fs["']/);
  });
});
