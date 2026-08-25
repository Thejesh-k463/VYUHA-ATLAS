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
