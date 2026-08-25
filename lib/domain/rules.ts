// Pure categorization rules. No DB, no React (invariant 2).
// A pattern wrapped in /slashes/ is a case-insensitive regex; anything else is a
// case-insensitive substring. An invalid regex degrades to substring — a typo'd
// rule must never crash categorization.

export interface RuleDef {
  id: number;
  pattern: string;
  category: string;
  priority: number;
}

type Matcher = (desc: string) => boolean;

export function compileRule(pattern: string): Matcher {
  const m = /^\/(.+)\/$/.exec(pattern.trim());
  if (m) {
    try {
      const re = new RegExp(m[1], "i");
      return (desc) => re.test(desc);
    } catch {
      // fall through to substring on the raw pattern
    }
  }
  const needle = pattern.trim().toLowerCase();
  return (desc) => needle !== "" && desc.toLowerCase().includes(needle);
}

/** First match wins: priority ascending, then id ascending. Null = no rule matched. */
export function categorize(rules: RuleDef[], description: string): { category: string; ruleId: number } | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const rule of ordered) {
    if (compileRule(rule.pattern)(description)) {
      return { category: rule.category, ruleId: rule.id };
    }
  }
  return null;
}
