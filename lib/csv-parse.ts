/** Simple CSV parser with quoted-field support */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur.trim() || lines.length === 0) lines.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() || lines.length === 0) lines.push(cur);

  const parsed = lines
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const fields: string[] = [];
      let field = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') {
            field += '"';
            i++;
          } else q = !q;
        } else if (c === "," && !q) {
          fields.push(field.trim());
          field = "";
        } else field += c;
      }
      fields.push(field.trim());
      return fields;
    });

  if (parsed.length === 0) return { headers: [], rows: [] };
  const headers = parsed[0].map((h) => h.trim());
  const rows = parsed.slice(1).filter((r) => r.some((c) => c.length > 0));
  return { headers, rows };
}

export function rowsToRecords(
  headers: string[],
  rows: string[][]
): Record<string, string>[] {
  return rows.map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = cells[i] ?? "";
    });
    return rec;
  });
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
