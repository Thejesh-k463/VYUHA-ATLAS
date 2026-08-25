import { describe, expect, it } from "vitest";
import { classifyCasTx, parseCasText, parseNomineeLine } from "@/lib/import/cas-parse";

// Fabricated fixture reproducing the REAL layout of a CAMS+KFintech detailed CAS
// (wrapped Registrar line, page furniture mid-scheme, parenthesised negatives,
// amount-only tax rows, dated no-money rows). Values are invented.
const FIXTURE = [
  "Consolidated Account Statement",
  "01-Mar-2022 To 25-Aug-2026",
  "Email Id: someone@example.com This Consolidated Account Statement is brought to you as an investor",
  "PORTFOLIO SUMMARY",
  "Cost Value Market Value",
  "Mutual Fund",
  "(INR) (INR)",
  "Alpha Mutual Fund 10,000.00 12,500.00",
  "Beta Mutual Fund 54,070.63 60,000.00",
  "Total 64,070.63 72,500.00",
  "Date Transaction Amount Units Price Unit",
  "(INR) (INR) Balance",
  "Alpha Mutual Fund",
  "Folio No: 910152703963 / 0 PAN: ABCDE1234F KYC: OK PAN: OK",
  "Some Investor Name",
  "128SCDGG-Alpha Small Cap Fund Direct Growth (Non Demat) - ISIN: INF846K01K35(Advisor: INZ000208032) Registrar :",
  "KFINTECH",
  "Nominee 1: SOMEONE Nominee 2: SOMEONE ELSE Nominee 3:",
  "Opening Unit Balance: 0.000",
  "13-Apr-2022 Systematic Investment New Purchase with SIP (1) 1,999.90 28.909 69.18 28.909",
  "13-Apr-2022 *** Stamp Duty *** 0.10",
  "13-Jun-2022 Systematic Investment (1) 1,999.90 32.329 61.86 61.238",
  "13-Jun-2022 *** Stamp Duty *** 0.10",
  "Page 1 of 10",
  "Consolidated Account Statement",
  "Email Id: someone@example.com Statement continues here disclaimer",
  "Date Transaction Amount Units Price Unit",
  "(INR) (INR) Balance",
  "19-Jun-2024 Redemption less TDS, STT (4,070.63) (61.238) 66.47 0.000",
  "19-Jun-2024 *** STT Paid *** 0.04",
  "19-Mar-2026 ***Invalid Redemption19-MAR-2026_Lien documents not received***",
  "Closing Unit Balance: 0.000 NAV on 24-Aug-2026: INR 137.33 Total Cost Value: 0.00 Market Value on 24-Aug-2026: INR 0.00",
  "Entry Load: NIL. Exit load disclaimer text",
  "Beta Mutual Fund",
  "Folio No: 21896258 / 14 PAN: ABCDE1234F KYC: OK PAN: OK",
  "P8184-Beta Infrastructure Fund - Direct Plan - Growth (Non-Demat) - ISIN: INF109K018M4(Advisor: INZ000208032) Registrar : CAMS",
  "Opening Unit Balance: 0.000",
  "29-Feb-2024 Switch in - From Technology Plan - Direct - Growth-BSE - - INZ000208032 54,067.93 312.694 172.91 312.694",
  "27-Feb-2026 Switch Out - To Technology Plan - Direct Growth-BSE - , less STT (10,000.00) (40.000) 250.00 272.694",
  "27-Feb-2026 *** STT Paid *** 0.10",
  "Closing Unit Balance: 272.694 NAV on 24-Aug-2026: INR 220.05 Total Cost Value: 54,070.63 Market Value on 24-Aug-2026: INR 60,006.31",
];

describe("parseCasText", () => {
  const result = parseCasText(FIXTURE);
  it("parses the statement header and portfolio summary", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.statement.periodFrom).toBe("2022-03-01");
    expect(result.statement.periodTo).toBe("2026-08-25");
    expect(result.statement.summaryTotal).toEqual({ cost: 64070.63, market: 72500 });
    expect(result.statement.amcSummary).toHaveLength(2);
  });

  it("parses holdings incl. a Registrar line wrapped onto the next line", () => {
    if (!result.ok) return;
    expect(result.holdings).toHaveLength(2);
    const [alpha, beta] = result.holdings;
    expect(alpha.folio).toBe("910152703963 / 0");
    expect(alpha.isin).toBe("INF846K01K35");
    expect(alpha.rta).toBe("KFINTECH");
    expect(alpha.amc).toBe("Alpha Mutual Fund");
    expect(alpha.schemeName).toContain("Alpha Small Cap Fund");
    expect(beta.rta).toBe("CAMS");
    expect(beta.amc).toBe("Beta Mutual Fund");
  });

  it("keeps transactions across page furniture and preserves CAS signs", () => {
    if (!result.ok) return;
    const alpha = result.holdings[0];
    expect(alpha.transactions).toHaveLength(7);
    const sips = alpha.transactions.filter((t) => t.txType === "purchase_sip");
    expect(sips).toHaveLength(2);
    expect(sips[0]).toMatchObject({ date: "2022-04-13", amount: 1999.9, units: 28.909, nav: 69.18 });
    const red = alpha.transactions.find((t) => t.txType === "redemption")!;
    expect(red.amount).toBeCloseTo(-4070.63, 2);
    expect(red.units).toBeCloseTo(-61.238, 3);
    const taxes = alpha.transactions.filter((t) => t.txType === "tax_or_charge");
    expect(taxes).toHaveLength(3); // 2× stamp duty + 1× STT
    expect(alpha.transactions.filter((t) => t.txType === "misc")).toHaveLength(1); // invalid redemption
  });

  it("parses the closing line: units, CAS NAV + date, cost and market value", () => {
    if (!result.ok) return;
    const beta = result.holdings[1];
    expect(beta.closingUnits).toBeCloseTo(272.694, 3);
    expect(beta.casNav).toBeCloseTo(220.05, 2);
    expect(beta.casNavDate).toBe("2026-08-24");
    expect(beta.costValue).toBeCloseTo(54070.63, 2);
    expect(beta.marketValue).toBeCloseTo(60006.31, 2);
  });

  it("classifies switches by direction", () => {
    if (!result.ok) return;
    const beta = result.holdings[1];
    expect(beta.transactions.find((t) => t.units === 312.694)?.txType).toBe("switch_in");
    expect(beta.transactions.find((t) => t.units === -40)?.txType).toBe("switch_out");
  });

  it("captures nominee names per folio; a folio without the line gets none", () => {
    if (!result.ok) return;
    expect(result.holdings[0].nominees).toEqual(["SOMEONE", "SOMEONE ELSE"]);
    expect(result.holdings[1].nominees).toEqual([]);
  });

  it("applies a nominee line printed before the scheme header (folio level)", () => {
    const reordered = [...FIXTURE];
    const [nomLine] = reordered.splice(17, 1); // move "Nominee 1: ..." to just after the folio line
    reordered.splice(14, 0, nomLine);
    const r = parseCasText(reordered);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.holdings[0].nominees).toEqual(["SOMEONE", "SOMEONE ELSE"]);
  });

  it("emits no warnings on a clean statement", () => {
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(0);
  });

  it("refuses non-CAS text instead of guessing", () => {
    const r = parseCasText(["hello", "world"]);
    expect(r.ok).toBe(false);
  });

  it("merges a re-printed scheme header after a page break instead of duplicating", () => {
    const withReprint = [
      ...FIXTURE.slice(0, 24), // through the first two SIPs + page furniture start
      "Folio No: 910152703963 / 0 PAN: ABCDE1234F KYC: OK PAN: OK",
      "128SCDGG-Alpha Small Cap Fund Direct Growth (Non Demat) - ISIN: INF846K01K35(Advisor: INZ000208032) Registrar :",
      "KFINTECH",
      ...FIXTURE.slice(24),
    ];
    const r = parseCasText(withReprint);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.holdings).toHaveLength(2);
    expect(r.holdings[0].transactions).toHaveLength(7);
  });
});

describe("parseNomineeLine", () => {
  it("splits indexed nominees and drops empty slots", () => {
    expect(parseNomineeLine("Nominee 1: A KUMAR Nominee 2: B. DEVI Nominee 3:")).toEqual(["A KUMAR", "B. DEVI"]);
  });
  it("treats Not Registered as no nominee", () => {
    expect(parseNomineeLine("Nominee 1: Not Registered Nominee 2: Nominee 3:")).toEqual([]);
    expect(parseNomineeLine("Nominee: NOT REGISTERED")).toEqual([]);
  });
  it("cuts trailing PAN/KYC furniture and ignores non-nominee lines", () => {
    expect(parseNomineeLine("Nominee: SOMEONE KYC: OK PAN: OK")).toEqual(["SOMEONE"]);
    expect(parseNomineeLine("Opening Unit Balance: 0.000")).toEqual([]);
  });
});

describe("classifyCasTx", () => {
  it("unit-bearing rows classify by kind even when taxes are mentioned", () => {
    expect(classifyCasTx("Redemption less TDS, STT", true)).toBe("redemption");
    expect(classifyCasTx("Switch Out - To Somewhere , less STT", true)).toBe("switch_out");
  });
  it("amount-only rows are taxes/charges or payouts", () => {
    expect(classifyCasTx("*** Stamp Duty ***", false)).toBe("tax_or_charge");
    expect(classifyCasTx("*** STT Paid ***", false)).toBe("tax_or_charge");
    expect(classifyCasTx("IDCW Payout", false)).toBe("dividend_payout");
  });
  it("dividend reinvestment carries units", () => {
    expect(classifyCasTx("IDCW Reinvestment", true)).toBe("dividend_reinvest");
  });
});
