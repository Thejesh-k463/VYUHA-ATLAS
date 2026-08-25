import { describe, expect, it } from "vitest";
import { parseMfapiLatest, parseNavAll } from "@/lib/import/amfi-nav";

// Live 8-field format (portal.amfiindia.com, observed 2026-08-25) mixed with
// legacy 6-field rows — both must parse.
const NAVALL_FIXTURE = [
  "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
  " ",
  "Open Ended Schemes(Equity Scheme - Small Cap Fund)",
  "",
  "Axis Mutual Fund",
  "",
  "125354;INF846K01K35;-;Axis Small Cap Fund;Direct Plan;Growth Option;137.3300;24-Aug-2026",
  "120503;INF109K018M4;INF109K019M2;Some Fund;Direct Plan;Growth;220.0500;24-Aug-2026",
  "777777;INF000LEGACY;-;Legacy 6-field row - Direct Growth;55.5000;24-Aug-2026",
  "999999;-;-;Fund with no ISIN;Direct Plan;Growth;10.0000;24-Aug-2026",
  "888888;INF000TEST01;-;Suspended fund;Direct Plan;Growth;N.A.;24-Aug-2026",
].join("\n");

describe("parseNavAll", () => {
  const map = parseNavAll(NAVALL_FIXTURE);
  it("indexes both ISIN columns and skips headers/junk", () => {
    expect(map.get("INF846K01K35")).toMatchObject({ amfiCode: "125354", nav: 137.33, date: "2026-08-24" });
    expect(map.get("INF109K018M4")?.amfiCode).toBe("120503");
    expect(map.get("INF109K019M2")?.amfiCode).toBe("120503"); // reinvestment ISIN column
    expect(map.get("INF000LEGACY")?.nav).toBe(55.5); // legacy 6-field shape still parses
  });
  it("never coerces N.A. NAVs or missing ISINs", () => {
    expect(map.get("INF000TEST01")).toBeUndefined();
    expect([...map.values()].every((e) => e.nav > 0)).toBe(true);
  });
});

describe("parseMfapiLatest", () => {
  it("parses the latest row and converts dd-mm-yyyy", () => {
    expect(
      parseMfapiLatest({ meta: { scheme_code: 125354 }, data: [{ date: "25-08-2026", nav: "138.12340" }] }),
    ).toEqual({ nav: 138.1234, date: "2026-08-25" });
  });
  it("returns null on malformed shapes instead of guessing", () => {
    expect(parseMfapiLatest(null)).toBeNull();
    expect(parseMfapiLatest({ data: [] })).toBeNull();
    expect(parseMfapiLatest({ data: [{ date: "bad", nav: "1" }] })).toBeNull();
    expect(parseMfapiLatest({ data: [{ date: "25-08-2026", nav: "0" }] })).toBeNull();
  });
});
