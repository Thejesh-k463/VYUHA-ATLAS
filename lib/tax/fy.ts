// Pure Indian financial-year helpers (Apr 1 – Mar 31). No DB, no React.

/** "2025-07-14" → "2025-26" */
export function fyOf(dateIso: string): string {
  const y = Number(dateIso.slice(0, 4));
  const m = Number(dateIso.slice(5, 7));
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function fyBounds(fy: string): { from: string; to: string } {
  const startYear = Number(fy.slice(0, 4));
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export function inFy(dateIso: string, fy: string): boolean {
  const { from, to } = fyBounds(fy);
  return dateIso >= from && dateIso <= to;
}

/** Assessment year label for a FY: "2025-26" → "AY 2026-27". */
export function ayOf(fy: string): string {
  const startYear = Number(fy.slice(0, 4)) + 1;
  return `AY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "2025-04-13" and lot "2024-04-12" → held > 12 months? Equity LT boundary. */
export function heldOverMonths(lotDateIso: string, sellDateIso: string, months: number): boolean {
  const lot = new Date(`${lotDateIso}T00:00:00Z`);
  const boundary = new Date(lot);
  boundary.setUTCMonth(boundary.getUTCMonth() + months);
  return new Date(`${sellDateIso}T00:00:00Z`).getTime() > boundary.getTime();
}
