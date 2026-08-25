import { describe, expect, it } from "vitest";
import { categorize, compileRule } from "@/lib/domain/rules";

describe("compileRule", () => {
  it("matches case-insensitive substrings", () => {
    expect(compileRule("zomato")("UPI-ZOMATO LTD-Food")).toBe(true);
    expect(compileRule("swiggy")("UPI-ZOMATO LTD-Food")).toBe(false);
  });
  it("treats /…/ as regex", () => {
    expect(compileRule("/^UPI-(ZOMATO|SWIGGY)/")("UPI-SWIGGY-ORDER")).toBe(true);
    expect(compileRule("/^UPI-(ZOMATO|SWIGGY)/")("POS ZOMATO")).toBe(false);
  });
  it("degrades an invalid regex to a substring instead of crashing", () => {
    expect(compileRule("/([/")("weird ([ text")).toBe(false); // falls back to raw substring "/([/"
    expect(compileRule("/([/")("has /([/ inside")).toBe(true);
  });
  it("an empty pattern matches nothing", () => {
    expect(compileRule("")("anything")).toBe(false);
  });
});

describe("categorize", () => {
  const rules = [
    { id: 1, pattern: "zomato", category: "food", priority: 100 },
    { id: 2, pattern: "/zomato|swiggy/", category: "eating-out", priority: 50 },
    { id: 3, pattern: "salary", category: "income", priority: 100 },
  ];
  it("first match wins by priority then id", () => {
    expect(categorize(rules, "UPI-ZOMATO LTD")).toEqual({ category: "eating-out", ruleId: 2 });
    expect(categorize(rules, "NEFT SALARY APR")).toEqual({ category: "income", ruleId: 3 });
    expect(categorize(rules, "FUEL PUMP")).toBeNull();
  });
});
