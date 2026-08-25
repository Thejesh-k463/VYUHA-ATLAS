// PDF → text lines for CAS statements (CAMS / KFintech consolidated account statements).
// No DB, no React — but not pure either (pdfjs is an I/O-ish dependency), so the text
// parser lives separately in cas-parse.ts and is unit-tested on fixture text.
// CAS PDFs are password-protected (PAN-based password chosen at request time).

export interface CasPdfResult {
  ok: true;
  lines: string[];
  pageCount: number;
}
export interface CasPdfError {
  ok: false;
  error: string;
  needsPassword?: boolean;
}

interface TextItemLike {
  str: string;
  transform: number[];
}

/** Group a page's text items into visual lines by y-coordinate (PDF origin is bottom-left). */
function itemsToLines(items: TextItemLike[]): string[] {
  const Y_TOLERANCE = 2.5;
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) =>
    r.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export async function extractCasPdfLines(
  data: Uint8Array,
  password: string | undefined,
): Promise<CasPdfResult | CasPdfError> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const task = pdfjs.getDocument({ data, password, useSystemFonts: true });
    const doc = await task.promise;
    const lines: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      lines.push(...itemsToLines(content.items as TextItemLike[]));
    }
    const pageCount = doc.numPages;
    await task.destroy();
    return { ok: true, lines, pageCount };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") {
      return {
        ok: false,
        needsPassword: true,
        error: password
          ? "The password did not unlock this PDF."
          : "This CAS PDF is password-protected — enter the password you chose when requesting it.",
      };
    }
    return { ok: false, error: `Could not read PDF: ${(err as Error)?.message ?? String(err)}` };
  }
}
