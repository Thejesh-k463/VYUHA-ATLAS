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

## Phase 3 — Expenses  [status: DONE — gate PASSED 2026-08-25]
Bank CSV importer (delimiter sniffing, preamble/header detection, auto column mapping with
override, split debit/credit or signed/Dr-Cr amounts, majority-vote date format), SHA-1
row dedup with occurrence counter, rules categorization (substring + /regex/, manual wins),
monthly rollups + budgets with over-limit alerts, recurring detection (≥3 hits, ~monthly,
±25% amount), UPI RRN extraction + cross-account self-transfer pairing, statement balance
→ balance_snapshot. /expenses screen with month nav, category editing, rules/budgets editors.
**Gate evidence:** unreadable rows rejected with reasons and never coerced (tests: bad date,
bad amount, empty desc, both-columns-filled, impossible 31/02); dedup asserted on fixture
repeats at hash level AND against a real migrated temp DB (3 insert → 0 on re-import), and
at runtime via the API (import#1 inserted 6, re-import inserted 0 / skipped 6). 118/118
tests in 15 files; runtime smoke on a temp-DB instance: dry-run mapping correct, rule
categorized at insert, budget over-limit rendered, SIP recurring detected, balance snapshot
2026-06-10 flowed to the Map. Real-data run (2026-08-25, SBI savings statement PDF →
converted to CSV): 144/144 rows imported, 0 rejected; running-balance chain verified
144/144 against the statement's own printed balances (opening ₹5,26,012.85 → closing
₹2,39,556.07 on 2025-06-24); re-import inserted 0 / skipped 144; balance snapshot flowed
to the Map (net worth ₹13.31L = 6.41L trading + 4.50L MF + 2.40L SBI, exact).

## Phase 4 — Goals & planning  [status: DONE — gate PASSED 2026-08-25]
Goals (target in today's rupees, inflates to target date), asset→goal mapping with share %
(MF holdings, accounts, trading book), required-SIP math (effective monthly rate, month-end
annuity), seeded Monte Carlo (mulberry32, 2,000 paths, success odds + p10/p50/p90),
emergency-fund gauge from real bank-import burn rate. /goals screen; migration 0004.
Risk-capital fence shipped earlier (phase 1.5, on the Map).
**Gate evidence:** Monte Carlo deterministic under fixed seed (byte-identical results in
tests AND identical success % across two live page renders); goal projections match
hand-computed fixtures (10L at 6%×10y = 17,90,847.70; 1L at 12%×120mo = 3,10,584.82;
zero-rate SIP exact; FV closes the loop to the paisa). 137/137 tests in 18 files. Live:
goal mapped trading 100% + SBI 50% = ₹7,60,608.96 exact, SIP ₹2,882.95/mo, success 46%
at exactly-required SIP (expected: just under 50% — median < mean under vol); test goal
deleted after verification, production data clean.

## Phase 5 — Unified tax pack  [status: DONE — gate PASSED 2026-08-26]
FY view across MF (per-FIFO-leg ST/LT at the 12-month boundary), equity delivery trades and
F&O (per-trade facts via new trading_trades + envelope importer extension, migration 0005);
Schedule 112A CSV generator + validator; ICAI turnover (Σ|gross P&L|) + s44AB/s44AD audit
verdict tree with reasons and stated assumptions; tax estimate (s111A/s112A/slab + cess) and
s208/s211 advance-tax schedule; manual loss carry-forward ledger with current-FY candidates.
All rates/thresholds in versioned tax_rates (seeded once, resolved per SALE date — the
23-Jul-2024 change is a config row, not code). /tax screen.
**Gate evidence:** generated 112A CSV passes its own portal validator clean (DD/MM/YYYY,
AE/BE, 12-char ISIN, no commas — commas in scheme names stripped, comma-in-number breaks
column count and is caught); validator violations tested per class; the download route
refuses to emit a file that fails validation. 154/154 tests in 19 files. Live on real data:
FY tabs 2023-24…2026-27; FY25-26 LTCG ₹14,400 inside the ₹1.25L exemption → ₹0 tax; FY24-25
resolves 15/10% by sale date vs FY25-26 20/12.5%; 112A files: 17 rows (FY25-26) / 14 rows
(FY24-25); 57 undated delivery + 1 undated F&O trade (net −₹1,835.19) quarantined from every
FY with loud warnings; envelope re-import populated per-trade facts with Map equity unchanged
to the paisa (₹6,40,830.92).

## Phase 6 — Protection & estate  [status: DONE — gate PASSED 2026-08-26]
Insurance policy registry (life/health/motor/other: insurer, policy no, sum assured, premium +
frequency, renewal date) with renewal reminders (Map strip + /protection). Life-cover adequacy
check computed from REAL data already in the DB (outstanding liabilities, active goal targets
inflated, median monthly burn from bank imports, existing corpus) with every component tagged
real-data | assumption | rule-of-thumb on screen — a missing input renders as missing, never 0,
and no rule of thumb appears unlabeled. Nominee registry across ALL assets (insurance, MF
folios — CAS "Nominee 1/2/3" lines now parsed at import, bank accounts, trading book) with a
missing/mismatch report. Encrypted death-pack export: one self-contained HTML file a family
member opens in a browser with a passphrase (scrypt N=2^17/r=8/p=1 + AES-256-GCM — the exact
keyfile passphrase-mode params; inlined scrypt-js + WebCrypto). Annual archive packs (per-FY
JSON download bundling that year's figures).
**Gate (defined 2026-08-26 BEFORE coding — phase is DONE only when every line is observed):**
1. `npm run verify` green (typecheck + all unit tests + build).
2. Adequacy math asserted against hand-computed fixtures (liabilities + inflated goals +
   years×annual expenses − counted assets = required cover; gap = required − existing cover),
   including the no-expense-data case: that component reports missing, the total is flagged
   incomplete, nothing is fabricated; the income-multiple figure appears ONLY when income is
   user-entered and ONLY labeled as a rule of thumb.
3. Death pack: encrypt → decrypt round-trip byte-identical at production scrypt params; wrong
   passphrase REFUSED (GCM auth failure, no partial plaintext); the ciphertext embedded in the
   generated HTML extracts and decrypts to the byte-identical payload; browser scrypt lib
   output pinned equal to node's scrypt on fixture vectors; no plaintext death-pack ever
   touches disk (module is fs-free — pinned by test; the route streams from memory).
4. Nominee report asserted on fixtures: missing nominee per asset, share sums ≠ 100 flagged,
   name variants (case/spacing/dots) grouped in the census; CAS nominee lines parse to names
   (empty slots and "Not Registered" → none).
5. Renewal classification fixtures (overdue / due ≤30 days / upcoming ≤90 days / ok).
6. Archive pack assembly fixtures: FY totals and counts propagate exactly; unknowns stay null.
7. Runtime on the real DB (port 3100): adequacy shows the real liability/goal/burn figures;
   nominee report runs against real holdings; a death pack generated with a test passphrase
   decrypts in an actual browser; archive pack downloads for a real FY; any test rows created
   for verification are deleted afterwards.
**Gate evidence (observed 2026-08-26):** `npm run verify` green — 182 tests in 23 files, build
clean. Adequacy fixtures exact (85,90,847.70 required / 60,90,847.70 gap; missing-expense case
excludes the component and flags LOWER BOUND; rule-of-thumb null without stated income). Death
pack: round-trip byte-identical at N=2^17; wrong passphrase and tampered ciphertext both throw;
HTML-embedded envelope extracts and decrypts byte-identical with zero plaintext in the file
(grep-verified on a real 29KB pack); scrypt-js == node scrypt on fixture vectors; module pinned
fs-free by test. Nominee fixtures: missing/shares≠100/name-variant census all asserted; CAS
nominee lines parse (indexed slots, Not Registered, folio-level placement). Renewal boundaries
−1/0/30/31/90/91 days asserted. Archive fixtures: totals/counts propagate, unknowns stay null,
bad FY label refused. Runtime on the REAL DB: required cover ₹9,34,80,018.99 = 0 liabilities +
0 goals + ₹9,48,10,617 (median burn from 4 real months × 12 × 15y) − ₹13,30,598.01 counted
assets (= the Map's figure exactly); nominee report listed all 10 real assets missing nominees;
test policy (₹50L life) surfaced "renewal in 11d" on the Map, flowed into the estate pack, and
was deleted after; estate pack decrypted IN A REAL BROWSER via embedded scrypt-js + WebCrypto
(all 8 active folios, SBI ₹2,39,556.07, trading ₹6,40,830.92) and refused a wrong passphrase
on screen; FY2025-26 archive pack: netWorth 13,30,598.01, MF LTCG 14,399.94 (the verified
₹14,400), 0 dated trading periods in that FY (correct — trades are FY26-27 + undated), expense
months 2025-04..06 only.

## Phase 7 — Behavioral bridge & reach  [status: TODO]
Tilt↔spending correlation, cooling-off guards, Tailscale read-only PWA, Telegram digest, family view.
