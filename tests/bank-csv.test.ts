import { describe, expect, it } from "vitest";
import {
  detectDateFormat,
  parseAmountCell,
  parseBankCsv,
  parseCsv,
  parseDateCell,
  sniffDelimiter,
} from "@/lib/import/bank-csv";

// Fabricated HDFC-style export: preamble junk, split debit/credit, dd/mm/yy,
// commas inside quoted narration, footer rows without dates.
const HDFC_STYLE = [
  "HDFC BANK Ltd.",
  "Statement of account,,,,,,",
  "Account No :,XXXXXXXXXX1234,,,,,",
  "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  '01/04/26,"UPI-ZOMATO LTD-zomato@paytm-UPI/DR/509912345678/Food order",0000509912345678,01/04/26,459.00,,"52,340.50"',
  '03/04/26,"NEFT CR-SALARY APR, ACME CORP",N123,03/04/26,,"85,000.00","1,37,340.50"',
  "05/04/26,POS 416021XXXXXX BIG BAZAAR,P999,05/04/26,2340.75,,134999.75",
  "07/04/26,BAD ROW NO AMOUNT,R1,07/04/26,,,",
  "09/04/26,BOTH FILLED,R2,09/04/26,10.00,20.00,999.00",
  "31/02/26,IMPOSSIBLE DATE,R3,31/02/26,5.00,,99.00",
  "11/04/26,UNREADABLE DEBIT,R4,11/04/26,abc,,99.00",
  ",,,,,,",
  "STATEMENT SUMMARY :-,,,,,,",
  'Opening Balance,,,,,,"52,799.50"',
].join("\n");

describe("parseBankCsv (gate: refuse, never coerce)", () => {
  const result = parseBankCsv(HDFC_STYLE);
  it("detects the header row under preamble junk and maps split debit/credit", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.headerIndex).toBe(3);
    expect(result.layout.mapping.debit).toBe(4);
    expect(result.layout.mapping.credit).toBe(5);
    expect(result.layout.mapping.balance).toBe(6);
    expect(result.layout.mapping.dateFormat).toBe("dmy");
  });

  it("parses good rows with signs and Indian-grouped balances", () => {
    if (!result.ok) return;
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      date: "2026-04-01",
      description: "UPI-ZOMATO LTD-zomato@paytm-UPI/DR/509912345678/Food order",
      amount: -459,
      balance: 52340.5,
    });
    expect(result.rows[1].amount).toBe(85000);
    expect(result.rows[1].balance).toBe(137340.5);
    expect(result.rows[2].amount).toBe(-2340.75);
  });

  it("rejects every unreadable row with a reason — never a coerced 0", () => {
    if (!result.ok) return;
    const reasons = result.rejected.map((r) => r.reason);
    expect(reasons).toContain("no amount in either debit or credit");
    expect(reasons).toContain("both debit and credit filled");
    expect(reasons.some((r) => r.includes('unreadable date "31/02/26"'))).toBe(true);
    expect(reasons.some((r) => r.includes('unreadable debit "abc"'))).toBe(true);
    // footer rows reject on empty/unreadable date, not as money rows
    expect(result.rejected.length).toBeGreaterThanOrEqual(6);
    // and no rejected row leaked into parsed rows as a zero
    expect(result.rows.every((r) => r.amount !== 0)).toBe(true);
  });
});

describe("single amount column with Dr/Cr tags", () => {
  const csv = [
    "Txn Date;Transaction Remarks;Amount;Balance",
    "01-Apr-2026;ATM WDL;1200.00 Dr;10,000.00",
    "02-Apr-2026;INTEREST CREDIT;350.50 Cr;10,350.50",
    "03-Apr-2026;SOMETHING;garbage;1.00",
  ].join("\n");
  const result = parseBankCsv(csv);
  it("sniffs semicolons, dMonY dates, and signs from Dr/Cr", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ date: "2026-04-01", amount: -1200 });
    expect(result.rows[1]).toMatchObject({ date: "2026-04-02", amount: 350.5 });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain("unreadable amount");
  });
});

describe("primitives", () => {
  it("parseCsv handles quoted fields with embedded delimiters and quotes", () => {
    expect(parseCsv('a,"b,c",d\n"say ""hi""",2,3', ",")).toEqual([
      ["a", "b,c", "d"],
      ['say "hi"', "2", "3"],
    ]);
  });
  it("sniffDelimiter prefers the dominant separator", () => {
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(sniffDelimiter("a\tb\n1\t2")).toBe("\t");
  });
  it("parseDateCell honors formats and rejects impossible dates", () => {
    expect(parseDateCell("25/08/2026", "dmy")).toBe("2026-08-25");
    expect(parseDateCell("08/25/2026", "mdy")).toBe("2026-08-25");
    expect(parseDateCell("2026-08-25", "ymd")).toBe("2026-08-25");
    expect(parseDateCell("25-Aug-26", "dMonY")).toBe("2026-08-25");
    expect(parseDateCell("31/02/2026", "dmy")).toBeNull();
    expect(parseDateCell("25/08/2026", "mdy")).toBeNull(); // month 25 impossible
  });
  it("detectDateFormat prefers day-first on ambiguous data, mdy only when forced", () => {
    expect(detectDateFormat([["01/04/26"], ["02/04/26"]], 0)).toBe("dmy");
    expect(detectDateFormat([["04/13/26"], ["04/14/26"]], 0)).toBe("mdy");
  });
  it("parseAmountCell: parentheses, rupee marks, junk", () => {
    expect(parseAmountCell("(1,234.56)")).toBe(-1234.56);
    expect(parseAmountCell("₹ 99")).toBe(99);
    expect(parseAmountCell("-500")).toBe(-500);
    expect(parseAmountCell("12.34.56")).toBeNull();
    expect(parseAmountCell("")).toBeNull();
  });
});
