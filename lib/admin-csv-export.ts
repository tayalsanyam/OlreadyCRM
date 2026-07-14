import { csvResponse } from "@/lib/report-utils";

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

export function wantsCsv(request: Request): boolean {
  return new URL(request.url).searchParams.get("format") === "csv";
}

export function exportListCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): Response {
  return csvResponse(
    filename,
    columns.map((c) => c.header),
    rows.map((row) =>
      columns.map((c) => {
        const v = c.value(row);
        if (v === null || v === undefined) return "";
        if (typeof v === "boolean") return v ? "Yes" : "No";
        return v;
      })
    )
  );
}

/** Build download URL preserving current filters. */
export function adminCsvHref(path: string, query = ""): string {
  const trimmed = query.replace(/^\?/, "");
  return trimmed ? `${path}?${trimmed}&format=csv` : `${path}?format=csv`;
}
