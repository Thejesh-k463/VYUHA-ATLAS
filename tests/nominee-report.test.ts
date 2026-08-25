import { describe, expect, it } from "vitest";
import { nomineeReport, normalizeNomineeName, type NomineeAssetRef, type NomineeEntry } from "@/lib/analytics/nominees";

const ASSETS: NomineeAssetRef[] = [
  { assetType: "insurance", refId: 1, label: "LIC term plan 12345", value: 5000000 },
  { assetType: "mf_holding", refId: 1, label: "Alpha Small Cap — folio 910/0", value: 250000 },
  { assetType: "mf_holding", refId: 2, label: "Beta Infra — folio 218/14", value: 60000 },
  { assetType: "account", refId: 1, label: "SBI Savings (…3868)", value: 239556.07 },
  { assetType: "trading", refId: 0, label: "Trading book (VYUHA)", value: null },
];

const ENTRIES: NomineeEntry[] = [
  { assetType: "insurance", refId: 1, name: "Thejesh Kumar", sharePct: 100, source: "manual" },
  { assetType: "mf_holding", refId: 1, name: "THEJESH KUMAR", sharePct: 50, source: "cas" },
  { assetType: "mf_holding", refId: 1, name: "B Devi", sharePct: 50, source: "cas" },
  { assetType: "account", refId: 1, name: "B. Devi", sharePct: 60, source: "manual" },
];

const CAS_UNSTATED: NomineeEntry[] = [
  { assetType: "mf_holding", refId: 2, name: "SOMEONE", sharePct: null, source: "cas" },
];

describe("nomineeReport", () => {
  const r = nomineeReport(ASSETS, ENTRIES);

  it("flags assets with no nominee on record", () => {
    expect(r.missingCount).toBe(2); // mf_holding:2 and trading:0
    const missing = r.assets.filter((a) => a.status === "missing").map((a) => `${a.assetType}:${a.refId}`);
    expect(missing).toEqual(["mf_holding:2", "trading:0"]);
  });

  it("flags share sums that are not 100", () => {
    expect(r.sharesInvalidCount).toBe(1);
    const bad = r.assets.find((a) => a.status === "shares_invalid")!;
    expect(bad.assetType).toBe("account");
    expect(bad.shareTotal).toBe(60);
  });

  it("a fully nominated asset with shares summing to 100 is ok", () => {
    expect(r.assets.find((a) => a.assetType === "mf_holding" && a.refId === 1)?.status).toBe("ok");
    expect(r.assets.find((a) => a.assetType === "insurance")?.status).toBe("ok");
  });

  it("groups case/spacing/dot spellings of one person in the census", () => {
    expect(r.census).toHaveLength(2);
    const tk = r.census.find((c) => c.key === "thejesh kumar")!;
    expect(tk.variants).toEqual(["THEJESH KUMAR", "Thejesh Kumar"]);
    expect(tk.assetCount).toBe(2);
    const bd = r.census.find((c) => c.key === "b devi")!;
    expect(bd.variants).toEqual(["B Devi", "B. Devi"]);
    expect(r.variantNames).toHaveLength(2); // both names vary in spelling — actionable
  });

  it("an unstated share (CAS names-only) is unknown, not wrong — never flagged invalid", () => {
    const r2 = nomineeReport(ASSETS, [...ENTRIES, ...CAS_UNSTATED]);
    const mf2 = r2.assets.find((a) => a.assetType === "mf_holding" && a.refId === 2)!;
    expect(mf2.status).toBe("ok");
    expect(mf2.shareTotal).toBeNull();
    expect(r2.missingCount).toBe(1); // only trading remains missing
  });

  it("keeps unknown asset values null", () => {
    expect(r.assets.find((a) => a.assetType === "trading")?.value).toBeNull();
  });
});

describe("normalizeNomineeName", () => {
  it("casefolds, strips dots, collapses whitespace", () => {
    expect(normalizeNomineeName("  B.  Devi ")).toBe("b devi");
    expect(normalizeNomineeName("THEJESH KUMAR")).toBe("thejesh kumar");
  });
});
