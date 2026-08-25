// Death-pack build + encryption. Pure buffers in, buffers/strings out — this
// module MUST stay free of fs (pinned by tests/death-pack.test.ts): a plaintext
// death pack never touches disk. The route streams the result from memory.
//
// Crypto reuses the keyfile passphrase-mode parameters exactly
// (lib/db/keyfile.ts): scrypt(passphrase, salt, 32) with N=2^17, r=8, p=1,
// maxmem 256MB, then AES-256-GCM with a 12-byte IV and an AAD tag.
//
// The deliverable is ONE self-contained HTML file: embedded ciphertext + an
// inlined scrypt implementation (scrypt-js, passed in by the caller so this
// module stays fs-free) + WebCrypto AES-GCM. Family workflow: open the file in
// any modern browser, type the passphrase, read. Nothing is fetched from the
// network; nothing leaves the machine.

import { createCipheriv, createDecipheriv, randomBytesSafe, scryptSyncSafe } from "@/lib/db/node-crypto";

export const DEATH_PACK_AAD = "atlas-deathpack-v1";
export const DEATH_PACK_KDF = { algo: "scrypt" as const, N: 1 << 17, r: 8, p: 1 };
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

// ---- Payload shape: presentation-ready, so the HTML renderer stays generic ----

export interface DeathPackItem {
  label: string;
  sub?: string;
  fields: [string, string][];
}

export interface DeathPackSection {
  title: string;
  note?: string;
  items: DeathPackItem[];
}

export interface DeathPackPayload {
  atlasDeathPack: true;
  v: 1;
  generatedAt: string; // ISO
  title: string;
  intro: string;
  sections: DeathPackSection[];
}

// ---- Encrypted envelope ----

export interface DeathPackEnvelope {
  atlasDeathPack: true;
  v: 1;
  kdf: { algo: "scrypt"; N: number; r: number; p: number };
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  tag: string; // base64, 16 bytes
  ct: string; // base64
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // NFC-normalize so node and the browser opener derive from identical bytes.
  return scryptSyncSafe(Buffer.from(passphrase.normalize("NFC"), "utf8"), salt, 32, {
    ...DEATH_PACK_KDF,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function encryptDeathPack(plaintext: Buffer, passphrase: string): DeathPackEnvelope {
  const salt = randomBytesSafe(16);
  const iv = randomBytesSafe(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  cipher.setAAD(Buffer.from(DEATH_PACK_AAD));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    atlasDeathPack: true,
    v: 1,
    kdf: { ...DEATH_PACK_KDF },
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
}

/** Throws on a wrong passphrase or tampered envelope (GCM auth) — no partial plaintext. */
export function decryptDeathPack(env: DeathPackEnvelope, passphrase: string): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, Buffer.from(env.salt, "base64")),
    Buffer.from(env.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(DEATH_PACK_AAD));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(env.ct, "base64")), decipher.final()]);
}

// ---- Self-contained HTML wrapper ----

const ENVELOPE_SCRIPT_ID = "atlas-pack-envelope";

/** Pull the envelope back out of a generated HTML file (tests + in-app opener). */
export function extractEnvelopeFromHtml(html: string): DeathPackEnvelope | null {
  const m = html.match(
    new RegExp(`<script type="application/json" id="${ENVELOPE_SCRIPT_ID}">([\\s\\S]*?)</script>`),
  );
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as DeathPackEnvelope;
    return parsed?.atlasDeathPack === true && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Wrap an envelope into the one-file HTML opener. `scryptLibJs` is the
 * scrypt-js UMD source, read from node_modules by the CALLER (route) so this
 * module never touches fs. The `</script>`-safe escape keeps both embedded
 * blocks from terminating early.
 */
export function buildDeathPackHtml(env: DeathPackEnvelope, scryptLibJs: string): string {
  const envJson = JSON.stringify(env).replace(/</g, "\\u003c");
  const lib = scryptLibJs.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>atlas · estate pack</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #0b1116; color: #dfe7ec; font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 2rem 1rem 4rem; }
  main { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: .02em; }
  .muted { color: #8fa3ad; font-size: .875rem; }
  #unlock { margin: 2.5rem auto 0; max-width: 420px; background: #121b22; border: 1px solid #22313c; border-radius: 12px; padding: 1.5rem; }
  input[type=password] { width: 100%; padding: .6rem .75rem; border-radius: 8px; border: 1px solid #2c3f4c; background: #0b1116; color: inherit; font-size: 1rem; margin-top: .75rem; }
  button { margin-top: .9rem; width: 100%; padding: .6rem; border-radius: 8px; border: 0; background: #14b8a6; color: #04211d; font-size: 1rem; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: wait; }
  #err { color: #f87171; font-size: .875rem; margin-top: .75rem; display: none; }
  #content { display: none; }
  section { background: #121b22; border: 1px solid #22313c; border-radius: 12px; padding: 1.25rem; margin-top: 1.25rem; }
  section h2 { font-size: 1.05rem; color: #a78bfa; margin-bottom: .25rem; }
  .note { color: #8fa3ad; font-size: .82rem; margin-bottom: .5rem; }
  .item { border-top: 1px solid #1c2a34; padding: .75rem 0; }
  .item:first-of-type { border-top: 0; }
  .item .label { font-weight: 600; }
  .item .sub { color: #8fa3ad; font-size: .82rem; }
  .fields { margin-top: .35rem; width: 100%; font-size: .9rem; border-collapse: collapse; }
  .fields td { padding: .12rem 0; vertical-align: top; }
  .fields td:first-child { color: #8fa3ad; width: 42%; padding-right: .75rem; }
</style>
</head>
<body>
<main>
  <h1>atlas · estate pack</h1>
  <p class="muted">An encrypted summary of what exists, where it is, and who to contact.
  This file is self-contained — it needs no internet and sends nothing anywhere.</p>
  <div id="unlock">
    <strong>Enter the passphrase</strong>
    <p class="muted">The person who prepared this file chose it. Unlocking takes a few
    seconds — that is deliberate (it makes guessing expensive).</p>
    <input id="pp" type="password" autocomplete="off" placeholder="Passphrase">
    <button id="go">Unlock</button>
    <p id="err"></p>
  </div>
  <div id="content"></div>
</main>
<script type="application/json" id="${ENVELOPE_SCRIPT_ID}">${envJson}</script>
<script>${lib}</script>
<script>
(function () {
  "use strict";
  var env = JSON.parse(document.getElementById("${ENVELOPE_SCRIPT_ID}").textContent);
  var b64 = function (s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  var scryptFn = (typeof scrypt !== "undefined" && scrypt.scrypt) ? scrypt.scrypt : (window.scryptJS && window.scryptJS.scrypt);
  var el = function (id) { return document.getElementById(id); };

  function render(payload) {
    var content = el("content");
    content.innerHTML = "";
    var intro = document.createElement("p");
    intro.className = "muted";
    intro.textContent = payload.intro + " Generated " + payload.generatedAt.slice(0, 10) + ".";
    content.appendChild(intro);
    payload.sections.forEach(function (s) {
      var sec = document.createElement("section");
      var h = document.createElement("h2"); h.textContent = s.title; sec.appendChild(h);
      if (s.note) { var n = document.createElement("p"); n.className = "note"; n.textContent = s.note; sec.appendChild(n); }
      s.items.forEach(function (it) {
        var d = document.createElement("div"); d.className = "item";
        var l = document.createElement("div"); l.className = "label"; l.textContent = it.label; d.appendChild(l);
        if (it.sub) { var sb = document.createElement("div"); sb.className = "sub"; sb.textContent = it.sub; d.appendChild(sb); }
        if (it.fields && it.fields.length) {
          var t = document.createElement("table"); t.className = "fields";
          it.fields.forEach(function (f) {
            var tr = document.createElement("tr");
            var k = document.createElement("td"); k.textContent = f[0];
            var v = document.createElement("td"); v.textContent = f[1];
            tr.appendChild(k); tr.appendChild(v); t.appendChild(tr);
          });
          d.appendChild(t);
        }
        sec.appendChild(d);
      });
      content.appendChild(sec);
    });
    el("unlock").style.display = "none";
    content.style.display = "block";
  }

  function fail(msg) {
    var e = el("err"); e.textContent = msg; e.style.display = "block";
    el("go").disabled = false; el("go").textContent = "Unlock";
  }

  el("go").addEventListener("click", function () {
    var pp = el("pp").value;
    if (!pp) { fail("Enter the passphrase."); return; }
    if (!window.crypto || !window.crypto.subtle) { fail("This browser does not expose WebCrypto — try a current Chrome/Edge/Firefox."); return; }
    if (!scryptFn) { fail("Embedded crypto library failed to load."); return; }
    el("err").style.display = "none";
    el("go").disabled = true; el("go").textContent = "Deriving key…";
    var enc = new TextEncoder();
    scryptFn(enc.encode(pp.normalize("NFC")), b64(env.salt), env.kdf.N, env.kdf.r, env.kdf.p, 32)
      .then(function (keyBytes) {
        el("go").textContent = "Decrypting…";
        return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      })
      .then(function (key) {
        var ct = b64(env.ct), tag = b64(env.tag);
        var data = new Uint8Array(ct.length + tag.length);
        data.set(ct); data.set(tag, ct.length);
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv), additionalData: enc.encode("${DEATH_PACK_AAD}") }, key, data);
      })
      .then(function (pt) { render(JSON.parse(new TextDecoder().decode(pt))); })
      .catch(function () { fail("Wrong passphrase (or the file is damaged). Nothing was revealed."); });
  });
  el("pp").addEventListener("keydown", function (e) { if (e.key === "Enter") el("go").click(); });
})();
</script>
</body>
</html>`;
}
