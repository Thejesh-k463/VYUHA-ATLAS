import { backupsDir, getEncryptionStatus } from "@/lib/db";
import { listBackups } from "@/lib/backup/engine";
import { BackupControls } from "@/components/system/backup-controls";

export const dynamic = "force-dynamic";

const TABLES = [
  "accounts",
  "balance_snapshots",
  "loans",
  "trading_periods",
  "trading_segments",
  "trading_charges",
  "trading_open_positions",
  "trading_capital",
  "trading_cashflows",
  "import_batches",
];

export default function SystemPage() {
  const enc = getEncryptionStatus();
  const backups = listBackups(backupsDir);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl font-semibold">System</h1>
        <p className="text-sm text-ink-soft">Encryption, backups, and your way out.</p>
      </section>

      <section className="panel p-5 text-sm">
        <h2 className="mb-2 font-display text-sm font-medium text-violet">Encryption</h2>
        <p>
          Database encrypted at rest (ChaCha20) — key provider: <span className="num">{enc.provider}</span>
          {enc.provider === "dpapi" && " (bound to this Windows user; the file is unreadable off this machine)"}
          {enc.provider === "passphrase" && " (strongest mode — nothing opens without ATLAS_PASSPHRASE)"}.
        </p>
        {enc.preEncryptBackupPath && (
          <p className="mt-2 text-gold">
            A plaintext safety copy from the encryption migration still exists at{" "}
            <span className="num">{enc.preEncryptBackupPath}</span> — delete it once you&apos;ve confirmed
            everything works.
          </p>
        )}
      </section>

      <section className="panel p-5 text-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-medium text-violet">Backups</h2>
          <BackupControls />
        </div>
        <p className="mb-3 text-ink-soft">
          Encrypted snapshots, verified on creation (integrity check + reopen with key). Taken automatically
          when the app opens and the newest is older than a day; kept: last 14 + monthly for a year.
        </p>
        {backups.length === 0 ? (
          <p className="text-ink-soft">No backups yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {backups.map((b) => (
                <tr key={b.fileName} className="border-t border-panel-edge/50">
                  <td className="num py-1.5">{b.fileName}</td>
                  <td className="num py-1.5 text-right text-ink-soft">{(b.sizeBytes / 1024).toFixed(0)} KB</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel p-5 text-sm">
        <h2 className="mb-2 font-display text-sm font-medium text-violet">Open-format export</h2>
        <p className="mb-3 text-ink-soft">
          Your data in formats that outlive this app. Money columns in exports are integer paise (stated
          inside the file).
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export" className="rounded bg-teal-deep px-3 py-1.5 font-medium text-ground hover:bg-teal">
            Everything (JSON)
          </a>
          {TABLES.map((t) => (
            <a key={t} href={`/api/export?table=${t}`} className="rounded border border-panel-edge px-3 py-1.5 text-ink-soft hover:text-teal">
              {t}.csv
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
