# Decisions — measured facts and deliberate deviations

Append-only. Check here before changing a constant that looks arbitrary.

## 2026-08-25 — VYUHA envelope money units are MIXED (verified by reading VYUHA source)

`dumpDatabase()` in VYUHA (`lib/backup.ts:62`) serializes rows via `db.select().from(...)`,
so values pass through Drizzle's runtime types:

- `trades` money columns (`netPnl`, `grossPnl`, `chargesTotal`, `buyValue`, `sellValue`, all
  charge fields) use the `moneyPaise` custom type → the envelope carries **RUPEES**.
- `ledger_entries.amountPaise` is a plain `integer("amount_paise")` column (schema.ts:595) →
  the envelope carries **PAISE** (signed).
- `capital_snapshots` uses `real` columns → **RUPEES**.

The importer (`lib/import/vyuha-envelope.ts`) encodes exactly this. Do not "normalize" it to
one unit at the parser boundary without re-verifying against VYUHA's schema — a wrong guess
here is a silent 100× error in net worth.

## 2026-08-25 — Undated closed trades bucket to period "undated", never a guessed month

The first real envelope (63 trades) had 57 closed trades with NULL sellDate AND buyDate —
all from `Dhan_P&L_01-07-2026_26-07-2026.csv`, a broker P&L report VYUHA imports without
per-trade dates. Their net P&L was −₹1,43,671.55; the original parser skipped them, silently
removing that money from net worth. Fix: closed trades with a P&L but no date aggregate under
`period = "undated"` — totals preserved, timing honestly unknown. Rejected: inferring the month
from the source filename or the row's createdAt (both are fabrication — createdAt is the IMPORT
date, and filenames are not a contract). "undated" is excluded from lastPeriod.

## 2026-08-25 — Encryption scheme: DPAPI-wrapped DEK default, scrypt passphrase mode optional

Adapted from VYUHA's production vault (analyzed read-only): random 32-byte DEK is the SQLite
cipher key (raw hex, driver KDF bypassed), wrapped in `data/atlas.key` by Windows DPAPI
(PowerShell, blobs in env vars — never interpolated) with scrypt(MachineGuid) AES-GCM fallback.
`ATLAS_PASSPHRASE` switches to scrypt(passphrase, salt, N=2^17, maxmem=256MB) — note node's
default scrypt maxmem (32MB) throws at N=2^17; the explicit maxmem is load-bearing.
Honest claim: file useless off-machine (dpapi/machine) or without passphrase (passphrase mode);
dpapi/machine modes do NOT defend against code already running as this user.
Deviation from blueprint: scrypt, not Argon2id — built into node (no native dep), same KDF
family VYUHA uses for backup encryption.

## 2026-08-25 — SQLite3MultipleCiphers cannot rekey a WAL database

Found live: the gate test's synthetic plaintext DB (journal_mode DELETE) migrated fine, while
the real WAL-mode DB looped a silently-failing `PRAGMA rekey` on every request, minting a
pre-encrypt safety copy each time. Fix in `lib/db/core.ts`: checkpoint → `journal_mode=DELETE`
→ rekey → reopen (pragmas restore WAL, which IS supported on already-encrypted DBs). The test
now creates its legacy DB in WAL mode so the trap stays pinned.

## 2026-08-25 — drizzle driver + better-sqlite3-multiple-ciphers

`drizzle()` passes a client instance straight through (no instanceof check), but
`drizzle-orm/better-sqlite3/driver.js` top-level-imports `better-sqlite3` — so the plain
package stays installed as an import-only peer. Types come from a local declaration shim
(`types/better-sqlite3-multiple-ciphers.d.ts`) mapping onto @types/better-sqlite3.

## 2026-08-25 — Trading equity formula is pnlRolledIn-immune

equity = Σ(openingCapital − realisedPnlToDate) + realizedPnlTotal + dividends + netDeposits
+ unrealizedPnl. Subtracting realisedPnlToDate cancels P&L that VYUHA already rolled into
capital (pnlRolledIn=1) and is a no-op when it didn't (realisedPnlToDate=0) — one formula,
both settings, no double count. Pinned in tests/trading-insights.test.ts.

## 2026-08-25 — Charges waterfall uses CLOSED-trade charges only

gross − charges = net must reconcile exactly (VYUHA guarantees netPnl = grossPnl − chargesTotal
per closed trade). The per-type breakdown additionally includes entry charges on OPEN positions
(real money already spent) and can exceed the waterfall figure — shown with an explicit note,
never silently mixed. First build mixed them and was off by ₹2,972 on live data.

## 2026-08-25 — Planning view refuses to project under 6 dated months

MIN_PLANNING_MONTHS=6; undated-bucket P&L never feeds monthly statistics. Positive median gets
a 50% haircut annualized; negative median is never haircut toward zero. Constants are
conventions (user-tunable later), recorded here so nobody "fixes" the pessimism.

## 2026-08-25 — Replace-by-source import, not append/dedup

Re-importing a VYUHA envelope deletes all `source='vyuha'` rows and re-inserts. Chosen over
row-level dedup because the envelope is always a complete snapshot (it carries every table),
so replace is simpler, idempotent, and cannot drift. Row-level dedup (VYUHA's SHA-1 approach)
is for incremental sources (bank CSVs, phase 3), not snapshot sources.

## 2026-08-25 — Encryption deferred to Phase 0.5, before any bank data

Blueprint places SQLCipher in Phase 0. Deferred one half-phase so the scaffold verifies on the
known-good `better-sqlite3` first (same binary VYUHA uses on this machine). The swap surface is
one module (`lib/db/index.ts`); the gate is "encrypted before the first bank statement is stored,"
not "encrypted before any code runs." Trading facts imported meanwhile are already on this disk
in VYUHA's own unencrypted DB, so interim exposure is not increased.

## 2026-08-25 — Port 3100

VYUHA desktop binds 127.0.0.1:3000. Atlas dev/start binds 3100 so both run simultaneously.

## 2026-08-25 — MF NAV and units are REAL columns, not integer paise

NAVs carry 4 decimal places (₹116.3398, ₹463.9220 live in the user's CAS) and units 3.
Integer paise would silently truncate NAV precision; the paise invariant (AGENTS.md 1)
applies to money AMOUNTS (mf_transactions.amount_paise stays moneyPaise), not to
per-unit rates. Same rule as annualRatePct.

## 2026-08-25 — CAS import is replace-by-source with override survival

A detailed CAS is a complete-history snapshot, so `source='cas'` rows are wiped and
re-inserted per import (same rationale as the VYUHA envelope). User edits on holdings
(assetClass, owner) are re-applied across the wipe, keyed by folio+ISIN. Consequence
pinned in the UI: always import a FULL-history CAS, never a partial period — a partial
statement would silently truncate SIP history.

## 2026-08-25 — CAS closing NAV seeds nav_history

The "Closing Unit Balance" line prints NAV, date, cost and market value per scheme.
These are observed values, so they seed nav_history (source='cas') at import — the
portfolio is valued offline before the first network NAV refresh. The import response
reconciles Σ(parsed cost/market) against the CAS's own PORTFOLIO SUMMARY and reports
any gap; on the user's real CAS both matched to the paisa (374,011.26 / 450,211.02).

## 2026-08-25 — XIRR flow conventions (money-weighted, pocket view)

External flows: purchase/SIP/switch_in = −amount, redemption/switch_out = −amount
(CAS prints these negative, so this yields a positive inflow), dividend_payout = +|amount|;
terminal value = units × latest NAV on the NAV date. Dividend reinvest and segregation
move no external money (units enter FIFO at their stated cost / zero). Stamp duty and
STT are NOT separate flows: purchase rows already exclude them, redemption amounts are
already net — adding the tax rows would double-count (they are tracked as chargesTotal
instead). Basis: 365-day years, Excel XIRR convention; fixtures pinned to ±1bp.

## 2026-08-25 — AMFI NAVAll.txt moved hosts and grew to 8 fields (verified live)

www.amfiindia.com/spages/NAVAll.txt now returns an HTML "Document Moved" page
(non-redirect status — fetch does not follow); the live file is at
portal.amfiindia.com/spages/NAVAll.txt with EIGHT fields
(...;Scheme Name;Plan;Option;NAV;Date), not the 6 the older format had. Parser accepts
both (first 3 + last 2 fields are positionally stable); the refresh route tries portal
then www and treats a zero-row parse as failure so an HTML body can never look like
success. mfapi.in remains primary per-scheme (codes resolved from NAVAll by ISIN);
NAV refresh is idempotent via unique (isin, date) upsert — verified live, two
consecutive refreshes both upserted 9 rows with no growth.

## 2026-08-25 — Bank rows dedup by SHA-1 hash with a same-tuple occurrence counter

Row hash = sha1(accountId | date | amountPaise | normalized description | occurrence#),
occurrence counted per identical tuple WITHIN one parsed statement. Re-importing an
overlapping statement reproduces the same hash set → the unique index skips every repeat;
two genuinely identical same-day payments in one statement get #0/#1 and both insert.
Rejected alternative: hashing without the counter silently drops legitimate duplicate
payments (two identical UPI orders in one day is normal).

## 2026-08-25 — Date-format detection is majority-vote, day-first on ties

Real statements carry footer junk in the date column ("STATEMENT SUMMARY :-"), so
requiring every row to parse under one format detects nothing. The format winning the
most rows wins; dmy beats mdy on ties (Indian banks are day-first); junk rows then
reject row-by-row with reasons. An unreadable BALANCE never rejects a row — balance is
auxiliary and stays null; unreadable date/amount always rejects (the phase-3 gate).

## 2026-08-25 — Self-transfer pairing needs both legs; single-leg stays honest

Transactions sharing one UPI RRN with opposite amounts in two DIFFERENT accounts are
auto-categorized "transfer" and excluded from spending/income. With only one account's
statement imported, the out-leg counts as spending — deliberately: claiming "transfer"
without the receiving side in evidence would be fabrication. Manual category 'transfer'
is the user's override. Same-account same-ref pairs never auto-pair (refunds exist).

## 2026-08-25 — Statement balance column feeds balance_snapshots

A balance-bearing import records one snapshot (source 'import') at the statement's
latest dated row, so the Map follows the bank balance without manual entry. Recurring
detection: ≥3 debits of one merchant key, median gap 26–35 days, every amount within
±25% of the median — SIPs/rent/subscriptions qualify; ad-hoc spending does not.

## 2026-08-25 — Goal math conventions: effective monthly rate, month-end SIP

Rates are % p.a.; monthly compounding uses the EFFECTIVE monthly rate (1+r)^(1/12)−1 so
12%/yr compounds to exactly 12%/yr (not 12.68% as r/12 would). SIP lands month-end
(ordinary annuity). Targets are entered in TODAY's rupees and inflate to the target date.
Horizon in months uses mean month length (30.4375 days). requiredMonthlySip closes the
loop exactly: FV(corpus)+FV(sip) = inflated target to the paisa (pinned in tests).

## 2026-08-25 — Monte Carlo: mulberry32 seed, arithmetic monthly Normal returns

PRNG is mulberry32 (no Math.random anywhere — the phase gate is determinism under a fixed
seed). Monthly returns i.i.d. Normal(mean = r/12, sd = σ/√12), Box–Muller, floor at −100%
per month, SIP month-end, 2,000 paths. This is a funding gauge, not a market model — the
arithmetic convention slightly overstates drift vs the effective-rate deterministic math;
consequence: at exactly the required SIP, success odds land just under 50% (median < mean
under vol), observed 46% live. Seed per goal = (id×7919 + months) so a page render is
reproducible but the simulation refreshes as the horizon shrinks.

## 2026-08-25 — Emergency gauge refuses without real burn data; single-leg transfers bite

Gauge = liquid (bank/cash/fd accounts with known balances) ÷ median spend of up to 6
completed months of imported bank data; no data → no gauge (fabricating a burn rate is
worse than none). Live consequence on real data: SBI-only import counts transfers to the
user's HDFC account as spending (see the single-leg transfer decision), yielding 0.5
months covered — importing the HDFC statement (auto-pairing) or manually categorizing
those rows as 'transfer' corrects the burn rate. Deliberately left honest.

## 2026-08-26 — Tax rates live in a versioned table, resolved per SALE date

tax_rates(key, effectiveFrom, valueJson) seeded once from DEFAULT_TAX_RATES (Finance
(No.2) Act 2024 values incl. the 23-Jul-2024 LTCG 10→12.5% / STCG 15→20% change), then
the table is the authority — computations never read a rate from code. Resolution picks
the latest effectiveFrom ≤ the sale date, so FY 2024-25 sales on 19-Jun-2024 correctly
tax at 15/10% (verified live). A FY whose sales straddle a rate change gets the latest
rate on the net plus a loud "review the split manually" warning — netting across
different-rate buckets involves set-off ordering Atlas refuses to guess.

## 2026-08-26 — ICAI F&O turnover needs per-trade rows; trading_trades added

Turnover = Σ|gross P&L| per closed trade (ICAI Guidance Note absolutes); |net| fallback
when gross is missing, counted and flagged. Phase-1 stored only aggregates, so the
envelope importer now also lands per-trade facts in trading_trades (replace-by-source,
same wipe). Old imports show a "re-import your VYUHA backup" banner instead of empty
panels. Undated closed trades (the 57 Dhan rows + 1 F&O, net known, timing unknown)
are excluded from EVERY FY and surfaced loudly — the undated-period rule extended to tax.

## 2026-08-26 — Schedule 112A CSV self-validates; invalid files are never emitted

Generator follows the AY 2024-25 portal template columns; the validator enforces the
portal's parser rules (DD/MM/YYYY, AE/BE codes, 12-char ISIN, plain numbers, and NO
commas anywhere — scheme-name commas are stripped to spaces). The download route runs
the validator on its own output and returns 500 with violations rather than an invalid
file. The header row is data, not law — re-check the portal's current template each AY.

## 2026-08-26 — Non-equity MF classes go to the slab bucket, hybrid included

Only assetClass 'equity' gets s111A/112A treatment. Debt/gold/other AND hybrid route to
the slab-taxed bucket: a hybrid fund's equity share decides its regime and guessing it
would be fabrication — the user reclassifies the holding if a fund is equity-oriented.
Slab bucket taxes at the user-editable slab_assumption rate with the assumption stated
on screen. F&O/intraday losses are shown as carry-forward candidates, never auto-set-off.
