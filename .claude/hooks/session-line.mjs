#!/usr/bin/env node
/**
 * session-line.mjs — SessionStart context line for VYUHA ATLAS.
 *
 * One line, <= 200 chars, four facts the operator otherwise re-derives by hand every session:
 *   git dirt count | newest encrypted backup + its age | last VERIFIED test count from STATE |
 *   newest phase marked DONE.
 *
 * Fail LOUD, not silent: a field that cannot be read prints "?" plus the reason, so a broken
 * probe is visible instead of looking like "nothing to report". Always exits 0.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ERR_LOG = path.join(os.homedir(), ".claude", "hooks", "errors.log");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function logError(e) {
  try {
    fs.mkdirSync(path.dirname(ERR_LOG), { recursive: true });
    fs.appendFileSync(ERR_LOG, `${new Date().toISOString()} session-line ${e?.stack || e}\n`);
  } catch {
    /* ignore */
  }
}

function gitDirt() {
  try {
    const out = execFileSync("git", ["status", "--short"], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const n = out.split("\n").filter((s) => s.trim()).length;
    return `git ${n} changed`;
  } catch {
    return "git ? (status failed)";
  }
}

function backup() {
  const dir = path.join(REPO, "data", "backups");
  try {
    if (!fs.existsSync(dir)) return "no backups dir";
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("atlas-") && f.endsWith(".sqlite"))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (!files.length) return "backups dir EMPTY";
    const hours = Math.round((Date.now() - files[0].m) / 3600000);
    return `backup ${files[0].f.replace(/^atlas-|\.sqlite$/g, "")} ${hours}h old`;
  } catch {
    return "backup ? (read failed)";
  }
}

function stateFacts() {
  const p = path.join(REPO, "VYUHA-ATLAS-STATE.md");
  try {
    const txt = fs.readFileSync(p, "utf8");
    // Newest section sits at the top of the file, so the first match is the current count.
    const t = txt.match(/(\d+)\/\d+ tests in (\d+) files/);
    const tests = t ? `${t[1]} tests/${t[2]} files` : "tests ? (no count in STATE)";
    let best = null;
    for (const m of txt.matchAll(/^## Phase ([\d.]+) [^\n]*\bDONE\b/gm)) {
      const n = parseFloat(m[1]);
      if (best === null || n > best) best = n;
    }
    const phase = best === null ? "phase ? (none DONE in STATE)" : `Phase ${best} DONE`;
    return [tests, phase];
  } catch {
    return ["tests ? (STATE unreadable)", "phase ? (STATE unreadable)"];
  }
}

try {
  const [tests, phase] = stateFacts();
  let line = `[atlas] ${gitDirt()} | ${backup()} | ${tests} | ${phase}`;
  if (line.length > 200) line = line.slice(0, 197) + "...";
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: line },
    }),
  );
} catch (e) {
  logError(e);
}
process.exit(0);
