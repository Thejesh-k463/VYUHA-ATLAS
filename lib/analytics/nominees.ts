// Pure nominee-coverage report. No DB, no React (AGENTS.md invariant 2).
//
// "Mismatch" here means something checkable, not a guess: an asset with no
// nominee on record, nominee shares that don't sum to 100, or the same person
// apparently spelled differently across assets (case/spacing/dot variants of
// one normalized name). Genuinely different names are the user's intent, not a
// defect — the census lays them side by side and the user decides.

export interface NomineeAssetRef {
  assetType: string; // insurance | mf_holding | account | trading
  refId: number;
  label: string; // human-readable ("HDFC Life 12345", "Parag Parikh Flexi Cap — folio 123/45")
  /** Current value in rupees when known; null stays null (invariant 6). */
  value: number | null;
}

export interface NomineeEntry {
  assetType: string;
  refId: number;
  name: string;
  /** 0..100; null = share not stated (a CAS prints names only — never fabricated). */
  sharePct: number | null;
  source: string; // manual | cas
}

export type AssetNomineeStatus = "ok" | "missing" | "shares_invalid";

export interface AssetNomineeRow extends NomineeAssetRef {
  status: AssetNomineeStatus;
  nominees: NomineeEntry[];
  /** Σ stated shares; null when any nominee's share is unstated (total unknowable). */
  shareTotal: number | null;
}

export interface NameCensusEntry {
  /** Normalized key (casefolded, dots stripped, whitespace collapsed). */
  key: string;
  /** Distinct spellings seen, as entered. >1 spelling = a variant worth unifying. */
  variants: string[];
  assetCount: number;
}

export interface NomineeReport {
  assets: AssetNomineeRow[];
  missingCount: number;
  sharesInvalidCount: number;
  census: NameCensusEntry[];
  /** Census entries whose spelling varies across assets — the actionable mismatches. */
  variantNames: NameCensusEntry[];
}

export function normalizeNomineeName(name: string): string {
  return name.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

const SHARE_EPSILON = 0.01;

export function nomineeReport(assets: NomineeAssetRef[], entries: NomineeEntry[]): NomineeReport {
  const byAsset = new Map<string, NomineeEntry[]>();
  for (const e of entries) {
    const k = `${e.assetType}:${e.refId}`;
    const list = byAsset.get(k) ?? [];
    list.push(e);
    byAsset.set(k, list);
  }

  const rows: AssetNomineeRow[] = assets.map((a) => {
    const noms = byAsset.get(`${a.assetType}:${a.refId}`) ?? [];
    const anyUnstated = noms.some((n) => n.sharePct === null);
    const shareTotal = anyUnstated ? null : noms.reduce((s, n) => s + (n.sharePct ?? 0), 0);
    // Shares can only be judged when every share is stated — an unstated share
    // (CAS-sourced) is unknown, not wrong.
    const status: AssetNomineeStatus =
      noms.length === 0
        ? "missing"
        : shareTotal !== null && Math.abs(shareTotal - 100) > SHARE_EPSILON
          ? "shares_invalid"
          : "ok";
    return { ...a, status, nominees: noms, shareTotal };
  });

  const census = new Map<string, { variants: Set<string>; assetKeys: Set<string> }>();
  for (const e of entries) {
    const key = normalizeNomineeName(e.name);
    if (!key) continue;
    const c = census.get(key) ?? { variants: new Set<string>(), assetKeys: new Set<string>() };
    c.variants.add(e.name.trim());
    c.assetKeys.add(`${e.assetType}:${e.refId}`);
    census.set(key, c);
  }
  const censusRows: NameCensusEntry[] = [...census.entries()]
    .map(([key, c]) => ({ key, variants: [...c.variants].sort(), assetCount: c.assetKeys.size }))
    .sort((a, b) => b.assetCount - a.assetCount || a.key.localeCompare(b.key));

  return {
    assets: rows,
    missingCount: rows.filter((r) => r.status === "missing").length,
    sharesInvalidCount: rows.filter((r) => r.status === "shares_invalid").length,
    census: censusRows,
    variantNames: censusRows.filter((c) => c.variants.length > 1),
  };
}
