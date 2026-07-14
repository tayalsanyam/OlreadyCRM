import { escapeCsvCell } from "@/lib/csv";

export type OverviewSection = {
  title: string;
  headers?: string[];
  rows: unknown[][];
};

export function sectionsToCsv(sections: OverviewSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (lines.length > 0) lines.push("");
    lines.push(escapeCsvCell(section.title));
    if (section.headers?.length) {
      lines.push(section.headers.map(escapeCsvCell).join(","));
    }
    for (const row of section.rows) {
      lines.push(row.map(escapeCsvCell).join(","));
    }
  }
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadOverviewCsv(filename: string, sections: OverviewSection[]): void {
  const csv = sectionsToCsv(sections);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
