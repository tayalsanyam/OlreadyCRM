export type LedgerPasteRow = {
  leadName: string;
  leadPhone: string;
  rowNumber: number;
};

const NAME_ALIASES = ["lead name", "bride name", "name", "lead"];
const PHONE_ALIASES = ["phone", "mobile", "bride phone", "phone number"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseLedgerPaste(raw: string): LedgerPasteRow[] {
  return parseLedgerRows(raw);
}

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === "\t") {
    return line.split("\t");
  }
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount >= commaCount ? "\t" : ",";
}

/** Parse tab-separated paste, comma-separated CSV export, or mixed ledger files. */
export function parseLedgerRows(raw: string, filename?: string): LedgerPasteRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const delimiter =
    filename?.match(/\.(csv|tsv)$/i) && !raw.includes("\t")
      ? filename.endsWith(".tsv")
        ? "\t"
        : ","
      : detectDelimiter(lines[0]);

  const firstCols = splitRow(lines[0], delimiter).map((c) => normalizeHeader(c));
  let nameIdx = firstCols.findIndex((c) => NAME_ALIASES.includes(c));
  let phoneIdx = firstCols.findIndex((c) => PHONE_ALIASES.includes(c));
  let start = 0;

  if (nameIdx >= 0 && phoneIdx >= 0) {
    start = 1;
  } else {
    nameIdx = 0;
    phoneIdx = 1;
    start = 0;
  }

  const rows: LedgerPasteRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitRow(lines[i], delimiter);
    const leadName = cols[nameIdx]?.trim();
    const leadPhone = cols[phoneIdx]?.trim();
    if (!leadName || !leadPhone) continue;
    rows.push({ leadName, leadPhone, rowNumber: i + 1 });
  }
  return rows;
}
