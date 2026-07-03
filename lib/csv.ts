import { toIsoTimestamp } from "@/lib/utils";

export function escapeCsvCell(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? toIsoTimestamp(value)
        : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return lines.join("\n");
}
