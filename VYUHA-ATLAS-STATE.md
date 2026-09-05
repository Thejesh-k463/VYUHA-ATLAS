# VYUHA-ATLAS-STATE — session handoff

Updated: 2026-08-26 (phases 2–5 shipped 25–26 Aug; phase 6 shipped later on 26 Aug).

## Phase 6 — Protection & estate — DONE, gate PASSED (2026-08-26, latest)
- /protection screen: insurance policy registry (life/health/motor/other; insurer, policy no,
  sum assured, premium+frequency, renewal date, owner) with renewal reminders (overdue/≤30d)
  on the Map too; life-cover adequacy (needs-based, every component tagged real-data |
  assumption | rule-of-thumb, missing stays missing); nominee registry across ALL assets with
  missing/shares≠100/name-variant report; encrypted death-pack export; per-FY archive packs
  (/api/archive?fy=). Migration 0006 (insurance_policies, nominees, protection_settings).
- Death pack = ONE self-contained HTML (embedded ciphertext + inlined scrypt-js + WebCrypto);
  crypto = keyfile passphrase params exactly (scrypt N=2^17/r=8/p=1 + AES-256-GCM); plaintext
  never touches disk (module fs-free, pinned by test). VERIFIED IN A REAL BROWSER on real data:
  decrypted all 8 active folios + SBI ₹2,39,556.07 + trading ₹6,40,830.92; wrong passphrase
  refused on screen. 182/182 tests in 23 files.
- cas-parse now captures "Nominee 1/2/3:" lines (names only, sharePct NULL — never fabricated;
  folio-level). **The current DB has NO CAS nominee names** (imported pre-change) — re-import
  the CAS PDF to land them; manual MF nominee rows survive re-import keyed folio+ISIN.
- Live adequacy: required ₹9,34,80,018.99 = 0 liabilities + 0 goals + ₹9,48,10,617 (median
  burn from 4 real months × 12 × 15y) − ₹13,30,598.01 counted assets (= Map exactly). The burn
  inherits the single-leg SBI→HDFC inflation (same basis as the emergency gauge, deliberate) —
  importing the HDFC statement fixes both. Insurance registry is EMPTY — user's real policies
  still need entering (test policy verified the full cycle and was deleted).
- Trap pinned in DECISIONS: "today" is the UTC date app-wide (renewal countdown can read +1
  day before 05:30 IST); WebCrypto needs a secure context (preview-pane data: snapshots lack it).

## Phase 5 — Unified tax pack — DONE, gate PASSED (2026-08-26)
- /tax screen: per-FY equity CG (MF FIFO legs ST/LT + delivery trades), F&O ICAI turnover
  (Σ|gross| per trade) + s44AB/s44AD verdict with reasons/assumptions, estimate + advance
  schedule, loss carry-forward ledger, versioned tax_rates table (seeded once, resolved
  per SALE date — 23-Jul-2024 change verified live: FY24-25 → 15/10%, FY25-26 → 20/12.5%).
- 112A CSV generator+validator (gate): route self-validates, never emits an invalid file.
  Live: 17 rows FY25-26, 14 rows FY24-25; FY25-26 LTCG ₹14,400 → ₹0 tax (inside 1.25L).
- Envelope importer extended with per-trade facts (trading_trades, migration 0005);
  re-imported the user's envelope from Downloads (11.1MB, still there) — Map equity
  unchanged to the paisa. 57 undated delivery + 1 undated F&O trade quarantined from
  every FY, loudly. 154/154 tests in 19 files.
- Real-data caveats pinned on screen: undated Dhan trades need dates in VYUHA; slab rate
  is an ASSUMPTION row (30%) the user should edit; hybrid MF routes to slab on purpose.

## Phase 4 — Goals & planning — DONE, gate PASSED (2026-08-25, latest)
- Goals CRUD + asset→goal mappings (mf_holding | account | trading, share %), inflated
  targets, required-SIP (effective monthly rate, month-end annuity, loop-closes to the
  paisa), Monte Carlo (mulberry32 seeded, 2,000 paths — deterministic, gate), emergency
  gauge (median burn from real bank months; refuses without data). /goals screen.
  Migration 0004. 137/137 tests in 18 files.
- Live-verified then cleaned up: mapped ₹7,60,608.96 exact (trading 100% + SBI 50%),
  SIP ₹2,882.95/mo, MC 46% at exactly-required SIP (expected <50%: median<mean under
  vol), identical across renders. Emergency gauge reads 0.5 months — honest artifact of
  single-leg HDFC transfers counting as spending; fix by importing the HDFC statement
  (auto-pairs) or categorizing those rows 'transfer'.

## What this project is
**atlas · by VYUHA** — "Map everything you own." Local-first personal financial planner
(Next.js + better-sqlite3/Drizzle + Tailwind v4, port 3100) for an Indian retail trader.
Separate codebase from VYUHA Trade Journal; ingests VYUHA data one-way via its backup envelope.
Product rationale, deployment decision, and phase plan: the "VYUHA Atlas Blueprint" artifact
(link in CLAUDE.md).

## Phase 3 — Expenses — DONE, gate PASSED (2026-08-25, latest)
- Bank CSV importer: delimiter sniff, header under preamble junk, auto column mapping
  (+API override), split debit/credit AND single signed/Dr-Cr amounts, majority-vote date
  format (footer junk loses the vote, then rejects row-by-row). Unreadable rows REJECT with
  reasons, never coerce (gate). Migration 0003: bank_transactions/expense_rules/budgets.
- Dedup: sha1(account|date|amountPaise|normDesc|occurrence#) + unique index — re-import
  skips all, same-day twins survive. Verified 3 ways: hash tests, temp-DB test, runtime
  API (import#1: 6 inserted; re-import: 0 inserted / 6 skipped).
- Rules (substring or /regex/, manual wins, re-apply endpoint), budgets + over-limit bars,
  recurring detection (≥3, ~monthly, ±25%), UPI RRN + cross-account transfer pairing
  (single-leg counts as spending on purpose — see DECISIONS), statement balance →
  balance_snapshots → Map. /expenses screen with month nav + category editing.
- 118/118 tests in 15 files; verify green. Runtime smoke ran on a TEMP DB (port 3101,
  ATLAS_DB_PATH) — then REAL-DATA verified: user's SBI savings statement (PDF, converted
  via scratch script) → account "SBI Savings (…3868)" id 1, 144/144 rows in, 0 rejected,
  balance chain 144/144 exact, re-import 0/144 (dedup), snapshot ₹2,39,556.07 @2025-06-24
  → Map ₹13.31L total. PDF→CSV conversion lives in scratch only; in-app PDF statement
  parsing is a possible later enhancement (SBI netbanking also exports CSV directly).

## Phase 2 — Investments — DONE, gate PASSED (2026-08-25, earlier)
- CAS PDF import (CAMS+KFintech detailed, pdfjs-dist password unlock) → mf_holdings /
  mf_transactions / nav_history / allocation_targets (migration 0002, replace-by-source
  'cas', user assetClass/owner overrides survive re-import keyed folio+ISIN).
- Pure modules: cas-parse (line parser, never coerces), lots (FIFO), xirr (Newton+bisection,
  ±1bp fixtures), portfolio, allocation, amfi-nav. /investments screen; MF book on Map.
- **Verified live on the REAL CAS** (10 folio-scheme holdings, 501 transactions,
  01-Mar-2022→25-Aug-2026): parsed Σcost 3,74,011.26 / Σmarket 4,50,211.02 = CAS's own
  summary to the paisa; FIFO units == CAS closing units on all 10; NAV refresh 9/9 live
  from mfapi (codes resolved via AMFI NAVAll), idempotent on re-run (9 upserts, no growth);
  portfolio XIRR 14.1%; Map net worth ₹10.91L = 6.41L trading + 4.50L MF.
- Traps pinned in DECISIONS.md: AMFI NAVAll moved to portal.amfiindia.com AND grew to
  8 fields (www host serves an HTML "moved" page that fetch won't follow — zero-row parse
  is treated as failure); NAV/units stay REAL (4dp NAVs), paise only for amounts; XIRR
  excludes stamp/STT rows (already inside CAS amounts — adding them double-counts);
  "Redemption less TDS, STT" must classify as redemption, not charge.
- 89/89 tests in 11 files; verify green. The CAS PDF password is used in-memory only,
  never stored or logged.

## Phase 1.5 — Trading intelligence bridge — DONE (2026-08-25, earlier)
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
1. Enter the user's REAL insurance policies on /protection (registry is empty; adequacy
   currently shows cover ₹0) and re-import the CAS PDF so nominee names land (parser now
   captures them; pre-change import has none). Then set assumptions (years=15 default,
   income unstated) to taste.
2. Import the user's HDFC statement — fixes the emergency gauge AND the adequacy expense
   component (SBI→HDFC transfers currently count as spending, burn rate inflated) and
   enables cross-account UPI pairing.
3. Data-quality items the tax pack surfaced: 57 undated Dhan delivery trades + 1 undated
   F&O trade excluded from every FY — adding dates in VYUHA and re-importing fixes; edit
   the slab_assumption tax_rates row (default 30%) to the real marginal slab.
4. The SBI statement covers only 2025-03-25 → 2025-06-24; newer statements refresh the
   balance snapshot and give recurring detection more months.
5. User has no goals defined yet — /goals is live and empty (goals feed adequacy too).
6. Phase 7 (behavioral bridge & reach) per ROADMAP.
7. Off-machine backup target (copy encrypted snapshots to a second drive/cloud) — the 3-2-1
   gap; snapshots are already encrypted so any dumb storage works. (Storing a death pack +
   archive packs there too now covers the estate angle.)
8. Optional: passphrase-mode rekey flow on the System page (env-only today).
9. Nice-to-have from phase 2: allocation targets are unset (user's book is all-equity today —
   set targets on /investments when debt/gold enter); NAV history chart; demat/equity CAS
   (NSDL/CDSL) is NOT parsed — only MF folios.

## Agent layer (2026-09-05)

Claude-Code agent layer added under `.claude/` (nothing else in the repo changed).

**Hooks** — `.claude/hooks/`, wired in `.claude/settings.json` with absolute forward-slash
commands (a backslash path is destroyed by the `sh` Claude Code runs hooks through), timeout 10:
- `secrets-guard.mjs` — PreToolUse(Bash). Before a `git commit`/`push` it reads what git actually
  holds (`git diff --cached --name-only` + `git ls-files`) and DENIES on any
  `*.sqlite`/`-wal`/`-shm`, `*.key`, `*.pem`, or `data/` path, quoting the AGENTS.md rule.
  Also denies `git commit|push|tag` issued from inside a subagent. Silence means allow, so it
  never bypasses the normal permission prompt. `--selftest` exercises `decide()` on fixtures.
- `session-line.mjs` — SessionStart. One line ≤200 chars: git dirt count, newest backup + age in
  hours, last VERIFIED test count from this file, newest phase marked DONE.

**Agents** — `.claude/agents/`:
| name | model | turns | role |
|---|---|---|---|
| `atlas-verifier` | sonnet | 25 | runs the gate once, reports the AGENTS.md end-of-session checklist as observed numbers |
| `atlas-monitor` | haiku | 12 | backup age + whether it verified (only `/api/backup` reveals that), encryption provider, git drift |
| `atlas-builder` | opus | 60 | builds a phase under written-first gate discipline and invariants 1–9; never commits |

**Skills** — `.claude/skills/`: `/atlas-verify` (forks to `atlas-verifier`), `/atlas-status`
(forks to `atlas-monitor`).

Trap worth keeping: `git ls-files | grep -Ei "sqlite|..."` false-positives on
`types/better-sqlite3-multiple-ciphers.d.ts`, which is source. The anchored pattern
`\.sqlite(-wal|-shm)?$|\.key$|\.pem$|^data/` is the one to use.
