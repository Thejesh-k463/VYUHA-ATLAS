import { CasImport } from "@/components/import/cas-import";
import { VyuhaImport } from "@/components/import/vyuha-import";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Import</h1>
          <p className="max-w-prose text-sm text-ink-soft">
            Bring your VYUHA trade journal onto the map. Export a backup from VYUHA (Backup screen →
            JSON download), then drop it here. The import is one-way and replaces the previous VYUHA
            import — Atlas never touches VYUHA&apos;s own database.
          </p>
        </div>
        <VyuhaImport />
      </section>
      <section className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-semibold">Mutual funds (CAS)</h2>
          <p className="max-w-prose text-sm text-ink-soft">
            Request a <em>detailed</em> consolidated account statement from CAMS or KFintech (full
            transaction history, ideally since your first investment), then import the PDF here.
            Re-importing replaces the previous CAS import — always use a full-history statement, not
            a partial period.
          </p>
        </div>
        <CasImport />
      </section>
    </div>
  );
}
