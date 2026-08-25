import { VyuhaImport } from "@/components/import/vyuha-import";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-2xl font-semibold">Import</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Bring your VYUHA trade journal onto the map. Export a backup from VYUHA (Backup screen →
          JSON download), then drop it here. The import is one-way and replaces the previous VYUHA
          import — Atlas never touches VYUHA&apos;s own database.
        </p>
      </section>
      <VyuhaImport />
    </div>
  );
}
