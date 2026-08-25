# VYUHA ATLAS — phase roadmap and verification gates

Source of truth for build order. A phase is DONE only when its gate passes with observed results.
Full rationale per phase: the VYUHA Atlas Blueprint artifact (link in CLAUDE.md).

## Phase 0 — Foundations  [status: DONE 2026-08-25]
Scaffold, SQLite + Drizzle + migrations, integer-paise money type, pure-lib layering,
owner-tagged account model, design tokens, test harness.
**Gate:** `npm run verify` green (typecheck + unit tests + next build); schema migrated on a
fresh DB; AGENTS.md invariants written.
Deferred from phase 0 (tracked, deliberate): SQLCipher-class encryption at rest (swap
`better-sqlite3` → `better-sqlite3-multiple-ciphers` behind `lib/db/index.ts`, one module),
scheduled `VACUUM INTO` backup job. Both land in Phase 0.5 before any real bank data is stored.

## Phase 0.5 — Protection prerequisites  [status: DONE — gate PASSED 2026-08-25]
Encrypted DB (ChaCha20 via better-sqlite3-multiple-ciphers; DPAPI-wrapped DEK by default,
scrypt-passphrase mode via ATLAS_PASSPHRASE), verified backups (VACUUM INTO → reopen+integrity
check → rotation: last 14 + monthly for 12), open-format JSON/CSV export, System screen.
**Gate evidence:** 35/35 tests incl. restore round-trip, corrupted-snapshot detection,
keyless-open refusal, WAL-plaintext migration; live DB encrypted in place (header is ciphertext,
figures intact to the paisa); backups verify `encrypted:true, integrity:ok`; plaintext safety
copy deleted after verification. Key derivation is scrypt (built-in, VYUHA-consistent), a
recorded deviation from the blueprint's Argon2id.

## Phase 1 — Net worth + VYUHA bridge  [status: DONE — gate PASSED 2026-08-25]
Gate evidence: verify green (25/25 tests); real envelope (v3, 63 trades, 1 attachment, 11.7MB)
round-tripped exactly — 59 closed + 4 open = 63 = envelope counts.trades, 0 skipped; dashboard
realized P&L −₹1,20,900.53 and charges ₹91,160.61 match totals computed independently from the
envelope to the paisa. Found+fixed in the process: 57 closed trades from a Dhan P&L import had
no trade dates → "undated" period bucket (docs/DECISIONS.md).
Accounts (asset/liability, owner-tagged), balance snapshots, loans with EMI amortization,
VYUHA envelope importer (one-way, replace-by-source), net worth dashboard with trading P&L.
**Gate:** `npm run verify` green; importer round-trips a real VYUHA envelope with counts
matching the envelope's own `counts`; net worth = assets − liabilities asserted in tests;
dashboard renders from a seeded DB.

## Phase 1.5 — Trading intelligence bridge  [status: DONE — verified 2026-08-25]
Deep envelope extraction (segments, per-type charges, open positions, capital snapshots) into
4 new tables + gross P&L on periods (migration 0001); mark-to-market trading equity
(pnlRolledIn-immune formula); "cost of trading" waterfall (reconciles to the paisa; open-entry
charges noted separately); monthly P&L chart with undated-bucket note; risk-capital fence on
the Map; planning view that refuses projections under 6 dated months. /trading screen.
**Evidence:** 49/49 tests; live: equity ₹6,40,830.92 (=7.55L capital − 1,20,900.53 + 6,731.45),
waterfall −29,739.92 − 91,160.61 = −1,20,900.53 exact, STT 89% of all-trade charges, fence
renders breached (only trading mapped so far — honest).

## Phase 2 — Investments  [status: DONE — gate PASSED 2026-08-25]
CAS (CAMS/KFintech detailed PDF, password-protected) → full SIP-history MF import;
holdings/lots with FIFO + realized gains; NAV refresh (mfapi.in primary via ISIN→code
resolution, AMFI NAVAll fallback); XIRR/CAGR per holding + portfolio; allocation targets
with drift alerts; /investments screen; MF book on the Map. Segregation/invalid-redemption
rows handled (zero-cost lots / no-money misc); dividend payout/reinvest classified.
**Gate evidence:** XIRR fixtures ±1bp incl. the Excel-documented case (0.373362535) and
analytic cases; FIFO tested (partial-lot consumption, oversell warning, zero-cost
segregated units, switch round-trip); NAV refresh idempotent by construction (unique
isin+date upsert) AND verified live — two consecutive refreshes each upserted 9 rows, no
growth. Real-data run: 10 holdings / 501 transactions imported; parsed cost 374,011.26
and market 450,211.02 both match the CAS's own summary to the paisa; FIFO units match
CAS closing units on all 10 holdings; 9/9 NAVs live from mfapi; portfolio XIRR 14.1%.
89/89 tests green. (Equity corporate actions beyond MF events belong to the demat/
equity phase — MF-side actions (segregation, switches, IDCW) are covered.)

## Phase 3 — Expenses  [status: TODO]
Column-mapping bank CSV importer, rules categorization, recurring detection, budgets, UPI dedup.
**Gate:** importer refuses unreadable rows (never coerces to 0); dedup asserted on fixture repeats.

## Phase 4 — Goals & planning  [status: TODO]
Goal math with inflation, holdings→goal mapping, Monte Carlo (seeded PRNG), emergency-fund gauge,
risk-capital fence.
**Gate:** Monte Carlo deterministic under fixed seed; goal projections match hand-computed fixtures.

## Phase 5 — Unified tax pack  [status: TODO]
Equity+MF+F&O FY view, Schedule 112A CSV (portal template), ICAI turnover + audit verdict,
advance-tax estimator, loss carry-forward ledger. Rates in a versioned config table, never code.
**Gate:** 112A CSV validates against portal template rules (DD/MM/YYYY, AE/BE codes, no commas).

## Phase 6 — Protection & estate  [status: TODO]
Insurance registry + adequacy, nominee registry + mismatch report, encrypted death-pack export,
annual archive packs.

## Phase 7 — Behavioral bridge & reach  [status: TODO]
Tilt↔spending correlation, cooling-off guards, Tailscale read-only PWA, Telegram digest, family view.
