import { describe, expect, it } from "vitest";
import { formatInr, formatInrCompact, paiseToRupees, roundPaise } from "@/lib/domain/money";

describe("formatInr", () => {
  it("uses Indian digit grouping", () => {
    expect(formatInr(1234567.5)).toBe("₹12,34,567.50");
  });
  it("marks negatives with a minus sign", () => {
    expect(formatInr(-500)).toBe("−₹500.00");
  });
});

describe("formatInrCompact", () => {
  it("uses lakh and crore", () => {
    expect(formatInrCompact(1234567)).toBe("₹12.35L");
    expect(formatInrCompact(56000000)).toBe("₹5.60Cr");
    expect(formatInrCompact(-250000)).toBe("−₹2.50L");
  });
});

describe("paise boundary", () => {
  it("converts VYUHA ledger paise to rupees", () => {
    expect(paiseToRupees(-1500050)).toBe(-15000.5);
  });
  it("rounds float drift to whole paise", () => {
    expect(roundPaise(0.1 + 0.2)).toBe(0.3);
  });
});
