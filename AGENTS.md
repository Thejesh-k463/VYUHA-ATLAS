# VYUHA ATLAS — agent contract

atlas · by VYUHA — "Map everything you own." Local-first personal financial planner
(net worth, investments, SIPs, expenses, goals, tax) for an Indian retail trader.
Sibling product to VYUHA Trade Journal; same engineering conventions, separate codebase.

Verify with `npm run verify` (typecheck + unit tests + `next build`), not tests alone.

## Invariants

1. **Money is integer paise in the DB, rupees at runtime.** The `moneyPaise` custom type in
   `lib/db/schema.ts` converts at the column boundary. Never convert again in application code.
   Rates and percentages stay REAL.
2. **Pure modules stay pure.** `lib/{domain,analytics,import}` import no DB and no React.
   DB access lives only behind `lib/queries/*` (server-only). Write the maths pure, unit-test it,
   then wrap it.
3. **VYUHA data flows ONE WAY, journal → Atlas.** Atlas ingests the VYUHA backup envelope
   (`vyuhaBackup: true, version ≤ 3`) or nothing. Atlas NEVER opens VYUHA's database read-write,
   never calls VYUHA's write routes, never modifies anything under `VYUHA-TRADE JOURNAL-V1`.
4. **Envelope money units are mixed — this is VYUHA's contract, not a bug.**
   Drizzle-dumped `trades` money fields (`netPnl`, `grossPnl`, `chargesTotal`) arrive in RUPEES
   (custom type converts on read). `ledger_entries.amountPaise` is a plain integer column and
   arrives in PAISE. `capital_snapshots` REAL columns are rupees. See docs/DECISIONS.md 2026-08-25.
5. **VYUHA import is replace-by-source, not append.** Re-importing an envelope deletes prior
   `source = 'vyuha'` trading facts and inserts fresh — idempotent by construction.
6. **Never fabricate a value.** Unknown balance renders as "—", never 0. Derived figures
   (net worth, outstanding loan balance) are computed from stored facts, never stored as truth.
7. **Every DB-reading page is `force-dynamic`.**
8. **Owner-tagging from day one.** Every account carries `owner` (self | spouse | joint | family)
   even while the app is single-user — retrofitting this is brutal, adding it now is free.
9. **Settings/editor writes use route handlers + client `fetch` + `router.refresh()`, NOT server
   actions** (server actions auto-refresh and silently reset sibling client state — learned in VYUHA).

## Conventions

- Ports: Atlas dev/start binds **3100** (VYUHA owns 3000). DB at `./data/atlas.sqlite`
  (override: `ATLAS_DB_PATH`); WAL mode, `busy_timeout`, `foreign_keys = ON`.
- After any schema change: `npm run db:generate`, commit the migration, migrations run
  automatically at connection open (`lib/db/index.ts`).
- Tailwind v4; theme tokens live in `app/globals.css` under `@theme`. Accent = teal
  (interactive only), gold = money leaving, violet = analytics — VYUHA's color-role law.
- Tests live in `tests/`, pure-module only unless the behaviour under test IS the I/O.
- Check `docs/DECISIONS.md` before changing a constant that looks arbitrary; append when you
  measure something or deviate from a spec.

## End-of-session discipline (repo sync)

Remote: https://github.com/Thejesh-k463/VYUHA-ATLAS (origin, branch `main`).
Before ending any working session, in this order:
1. `npm run verify` green (never commit red).
2. Update `VYUHA-ATLAS-STATE.md` with VERIFIED numbers (and ROADMAP/DECISIONS if phases moved).
3. Commit with a message that names what shipped; push to origin/main.
4. `git status` must be clean afterwards — an unpushed session is an unfinished session.
NEVER commit `data/` or any `*.sqlite`/key material — .gitignore enforces it; do not weaken it.

## Roadmap authority

`docs/ROADMAP.md` holds the phase plan and each phase's verification gate. A phase is DONE only
when its gate commands pass and the gate checklist is ticked with observed (not recalled) results.
