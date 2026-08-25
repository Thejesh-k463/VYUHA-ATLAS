# VYUHA-ATLAS-STATE — session handoff

Updated: 2026-08-25 (session that scaffolded the project).

## What this project is
**atlas · by VYUHA** — "Map everything you own." Local-first personal financial planner
(Next.js + better-sqlite3/Drizzle + Tailwind v4, port 3100) for an Indian retail trader.
Separate codebase from VYUHA Trade Journal; ingests VYUHA data one-way via its backup envelope.
Product rationale, deployment decision, and phase plan: the "VYUHA Atlas Blueprint" artifact
(link in CLAUDE.md).

## Phase 1.5 — Trading intelligence bridge — DONE (2026-08-25, latest)
- Envelope extraction extended: segments, per-type charges, open positions (nullable MTM),
  capital snapshots; gross P&L on periods. Migration 0001; 4 new tables; export/system updated.
- New /trading screen + risk fence on Map. **Verified live:** equity ₹6,40,830.92
  (₹7.55L VYUHA capital − ₹1,20,900.53 realized + ₹6,731.45 unrealized, pnlRolledIn-immune),
  charges waterfall reconciles to the paisa, STT = 89% of all-trade charges, 4 open positions,
  planning view correctly refuses projection (2 dated months < 6). 49/49 tests green.
- Traps pinned: waterfall = closed-trade charges only (breakdown may exceed, noted);
  undated bucket excluded from monthly stats and lastPeriod.

## Phase 0.5 — DONE, gate PASSED (2026-08-25, earlier same day)
- DB encrypted at rest: ChaCha20 via better-sqlite3-multiple-ciphers; raw-hex DEK wrapped by
  DPAPI in `data/atlas.key` (provider verified "dpapi" live); optional ATLAS_PASSPHRASE mode.
- Live migration verified: real DB encrypted in place, header is ciphertext, dashboard figures
  intact (−₹1,20,900.53 exact); plaintext safety copy DELETED after verification.
- Backups: auto on open (>24h stale) + manual; VACUUM INTO → reopen+integrity-verify → rotate
  (last 14 + monthly×12); same-second collisions get -2 suffixes (was a live 500).
- Open-format export: /api/export JSON envelope + per-table CSV (raw paise integers, stated).
- `npm run verify` GREEN: **35/35 tests in 5 files**, build clean. New System screen at /system.
- Traps pinned in tests + DECISIONS.md: WAL rekey impossibility, scrypt maxmem at N=2^17,
  drizzle needing better-sqlite3 as import-only peer.

## Current state — VERIFIED 2026-08-25 (phase 1)
- `npm run verify` GREEN: typecheck clean, **24/24 unit tests in 4 files**, `next build` clean
  (Next.js 16.3.2 resolved from ^16.2.9; Vitest 4.1.11).
- Migration `drizzle/0000_cold_thunderbolt.sql` generated; 6 tables (accounts,
  balance_snapshots, loans, trading_periods, trading_cashflows, import_batches).
- Runtime smoke test PASSED on `npm run start`: POST /api/accounts → {id:1}; POST
  /api/import/vyuha with a v3 fixture → {periods:2, cashflows:2, closedTrades:2, skipped:0};
  dashboard rendered net worth ₹7.52L = ₹5.00L account + ₹2,52,400.50 trading equity
  (paise-exact: realized ₹2,400.50, charges ₹180.25). Smoke DB deleted afterwards — `data/`
  is empty on purpose; the DB auto-creates and auto-migrates on first connection.
- No git history yet (repo not initialized). No lint config yet (verify = typecheck+test+build).

## Where the answer lives
| Question | File |
|---|---|
| Invariants, conventions | `AGENTS.md` (wins over this file) |
| Phase order + gates | `docs/ROADMAP.md` |
| Why envelope units are mixed, replace-by-source, port 3100, encryption deferral | `docs/DECISIONS.md` |
| VYUHA envelope contract | `lib/import/vyuha-envelope.ts` header + VYUHA's `lib/backup-format.ts` (read-only) |
| Product research | Blueprint artifact (CLAUDE.md link) |

## Live hazards
- **Envelope units are MIXED** (trades=rupees, ledger_entries.amountPaise=paise). Pinned by
  `tests/vyuha-envelope.test.ts`. Do not "normalize".
- **Never modify anything under `VYUHA-TRADE JOURNAL-V1`** — one-way bridge, read-only, always.
- `data/` and `*.sqlite` are gitignored; never commit a journal.
- Next build rewrote `tsconfig.json` (jsx: react-jsx etc.) — deliberate, keep.

## Phase 1 gate — PASSED 2026-08-25 with the user's real envelope
Real backup (v3, 11.7MB, 63 trades) imported: 59 closed + 4 open, 0 skipped; dashboard realized
P&L −₹1,20,900.53 / charges ₹91,160.61 — paise-exact vs totals computed independently from the
envelope. 25/25 tests green after adding the undated-period rule. **The user's REAL trading data
now lives in `data/atlas.sqlite`** (gitignored) — treat it as production data from here on.
Note: envelope had 0 ledger_entries (user hasn't recorded deposits in VYUHA's Cash & Ledger), so
trading equity currently equals realized P&L; recording capital in VYUHA and re-importing fixes it.

## Repository
https://github.com/Thejesh-k463/VYUHA-ATLAS — origin, branch `main`. Sync discipline lives in
AGENTS.md ("End-of-session discipline"): verify green → update this file → commit → push →
clean `git status`. `data/` (real encrypted financial data) is gitignored, never committed.

## Open work — next steps in order
1. Phase 2 (investments: CAS import, holdings/lots, NAV, XIRR) per ROADMAP.
3. Off-machine backup target (copy encrypted snapshots to a second drive/cloud) — the 3-2-1
   gap; snapshots are already encrypted so any dumb storage works.
4. Optional: passphrase-mode rekey flow on the System page (env-only today).
