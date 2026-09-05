#!/usr/bin/env node
/**
 * secrets-guard.mjs — PreToolUse(Bash) guard for VYUHA ATLAS.
 *
 * Two refusals, both from AGENTS.md:
 *   1. "NEVER commit data/ or any *.sqlite/key material" — before a `git commit`/`git push`
 *      goes through, look at what git actually holds (staged names + tracked names) and DENY
 *      if any path is DB, key or pem material. .gitignore is the first fence; this is the
 *      second, because a `git add -f` or a weakened .gitignore silently defeats the first.
 *   2. Subagents never commit. The orchestrating session commits after the proofs run, so a
 *      `git commit|push|tag` issued from inside an agent is refused outright.
 *
 * Convention (same as ~/.claude/hooks/coord.mjs): SILENCE MEANS ALLOW. The hook only ever
 * writes a decision when it is denying, so it never bypasses the normal permission prompt.
 * Run with --selftest to see decide() exercised against fixture path lists (prints ALLOW too).
 *
 * Fail-open: every internal error is logged and the tool proceeds. Always exits 0.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ERR_LOG = path.join(os.homedir(), ".claude", "hooks", "errors.log");

// data/ (the real encrypted financial DB), any sqlite file or its WAL/SHM sidecars,
// the DPAPI-wrapped DEK (data/atlas.key), and any private key material.
const RISKY = /\.sqlite(-wal|-shm)?$|\.key$|\.pem$|^data\/|atlas\.key/i;

const AGENTS_QUOTE =
  'AGENTS.md: "NEVER commit data/ or any *.sqlite/key material — .gitignore enforces it; do not weaken it."';

function logError(e) {
  try {
    fs.mkdirSync(path.dirname(ERR_LOG), { recursive: true });
    fs.appendFileSync(ERR_LOG, `${new Date().toISOString()} secrets-guard ${e?.stack || e}\n`);
  } catch {
    /* ignore */
  }
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

const isGitWrite = (cmd) => /\bgit\b[^\n]*\b(commit|push|tag)\b/i.test(cmd);
const isCommitOrPush = (cmd) => /\bgit\b[^\n]*\b(commit|push)\b/i.test(cmd);

/**
 * Pure decision. `paths` is the union of staged and tracked path names (forward slashes).
 * Returns { decision: "allow"|"deny", reason: string }.
 */
export function decide({ command = "", paths = [], agent = "" }) {
  if (agent && isGitWrite(command)) {
    return {
      decision: "deny",
      reason:
        `atlas: subagents never commit — this git write came from agent "${agent}". ` +
        "The orchestrating session commits after every proof has run (AGENTS.md end-of-session " +
        "discipline: verify green -> update VYUHA-ATLAS-STATE.md -> commit -> push). " +
        "Report what changed and leave the tree uncommitted.",
    };
  }
  if (!isCommitOrPush(command)) return { decision: "allow", reason: "" };

  const hits = paths.filter((p) => p && RISKY.test(p));
  if (hits.length) {
    return {
      decision: "deny",
      reason:
        `atlas: refusing this commit/push — ${hits.length} path(s) git holds are DB or key ` +
        `material: ${hits.slice(0, 5).join(", ")}${hits.length > 5 ? ", ..." : ""}. ` +
        AGENTS_QUOTE +
        " Untrack them (git rm --cached <path>) and check that .gitignore still covers data/, " +
        "*.sqlite, *.sqlite-wal, *.sqlite-shm before retrying.",
    };
  }
  return { decision: "allow", reason: "" };
}

function gitPaths(cwd) {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  return [...run(["diff", "--cached", "--name-only"]), ...run(["ls-files"])];
}

function selftest() {
  const cases = [
    { label: "staged DB file", command: "git commit -m x", paths: ["app/page.tsx", "data/proof.sqlite"] },
    { label: "tracked keyfile", command: "git push origin main", paths: ["data/atlas.key"] },
    { label: "wal sidecar", command: "git commit -am wip", paths: ["data/atlas.sqlite-wal"] },
    { label: "subagent commit", command: "git commit -m x", paths: [], agent: "atlas-builder" },
    { label: "clean commit", command: "git commit -m 'Phase 7'", paths: ["app/page.tsx", "docs/ROADMAP.md"] },
    { label: "non-git bash", command: "npm run verify", paths: ["data/atlas.sqlite"] },
  ];
  for (const c of cases) {
    const r = decide(c);
    process.stdout.write(`SELFTEST ${c.label}: DECISION=${r.decision}\n`);
    if (r.reason) process.stdout.write(`  reason: ${r.reason}\n`);
  }
}

try {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const input = readStdin();
    const command = input?.tool_input?.command || "";
    const cwd = input?.cwd || process.cwd();
    const agent = input?.agent_type || input?.agent_id || "";
    if (isGitWrite(command)) {
      const paths = isCommitOrPush(command) ? gitPaths(cwd) : [];
      const r = decide({ command, paths, agent });
      if (r.decision === "deny") deny(r.reason);
    }
  }
} catch (e) {
  logError(e);
}
process.exit(0);
