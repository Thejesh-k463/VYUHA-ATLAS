import { describe, expect, it } from "vitest";
import { emergencyGauge, medianMonthlySpend } from "@/lib/analytics/emergency";

describe("medianMonthlySpend", () => {
  it("takes the median of positive months only", () => {
    expect(medianMonthlySpend([30_000, 45_000, 32_000])).toBe(32_000);
    expect(medianMonthlySpend([30_000, 0, 40_000])).toBe(35_000); // zero months excluded
  });
  it("refuses with no real data", () => {
    expect(medianMonthlySpend([])).toBeNull();
    expect(medianMonthlySpend([0, 0])).toBeNull();
  });
});

describe("emergencyGauge", () => {
  it("computes coverage and status bands", () => {
    const ok = emergencyGauge(240_000, 30_000, 6)!;
    expect(ok.monthsCovered).toBeCloseTo(8, 5);
    expect(ok.status).toBe("ok");
    expect(emergencyGauge(120_000, 30_000, 6)!.status).toBe("watch"); // 4 months
    expect(emergencyGauge(60_000, 30_000, 6)!.status).toBe("low"); // 2 months
  });
  it("refuses to gauge without a burn rate (never fabricates)", () => {
    expect(emergencyGauge(240_000, null)).toBeNull();
    expect(emergencyGauge(240_000, 0)).toBeNull();
  });
});
