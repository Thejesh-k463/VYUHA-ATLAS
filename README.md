# atlas · by VYUHA

**Map everything you own.**

Repository: https://github.com/Thejesh-k463/VYUHA-ATLAS

Local-first personal financial planner for an Indian retail trader — net worth, investments,
SIPs, expenses, goals, and a unified tax view — with one-way ingestion of the VYUHA Trade
Journal's data. Nothing leaves your machine.

## Stack

Next.js (App Router) · React · TypeScript strict · better-sqlite3 + Drizzle (WAL, integer-paise)
· Tailwind v4 · Vitest. Desktop packaging (Tauri 2) arrives once the web core is stable.

## Run

```bash
npm install
npm run dev        # http://localhost:3100
```

The SQLite database is created and migrated automatically at `./data/atlas.sqlite`
(override with `ATLAS_DB_PATH`).

## Verify

```bash
npm run verify     # typecheck + unit tests + production build
```

## Importing VYUHA data

Export a backup from VYUHA (Backup screen → JSON, or `GET http://127.0.0.1:3000/api/backup`),
then Import → VYUHA envelope in Atlas. Import is one-way and replace-by-source: Atlas never
touches VYUHA's database or files.

## What the repo does NOT contain

`data/` (the encrypted journal DB, its key file, and backups) is gitignored — the repository
carries code and docs only, never financial data. Cloning gives a fresh empty Atlas.

## Documents

- `AGENTS.md` — invariants and conventions (binding).
- `VYUHA-ATLAS-STATE.md` — session handoff: verified state, hazards, next step.
- `docs/ROADMAP.md` — phases and their verification gates.
- `docs/DECISIONS.md` — measured facts; check before changing "arbitrary" constants.
