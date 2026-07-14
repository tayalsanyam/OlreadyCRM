export type OverviewDateRange = {
  dateFrom: string;
  dateTo: string;
};

export function parseOptionalOverviewDate(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export function parseOptionalOverviewMonth(raw: string | null): string | null {
  const v = raw?.trim();
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return null;
  return v;
}

/** First day of current calendar month through today (MTD). */
export function defaultOverviewDateRange(): OverviewDateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-${d}` };
}

export function defaultOverviewMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function parseOverviewMonth(searchParams: URLSearchParams): string {
  return parseOptionalOverviewMonth(searchParams.get("month")) ?? defaultOverviewMonth();
}

/** Map YYYY-MM to inclusive date range; current month ends today (MTD). */
export function overviewMonthToDateRange(month: string): OverviewDateRange {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return defaultOverviewDateRange();
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  if (month === defaultOverviewMonth()) {
    return defaultOverviewDateRange();
  }
  const end = new Date(y, m, 0);
  const endStr = end.toISOString().slice(0, 10);
  return { dateFrom: start, dateTo: endStr };
}

export function previousOverviewMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return defaultOverviewMonth();
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function overviewMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function parseOverviewDateRange(searchParams: URLSearchParams): OverviewDateRange {
  const month = parseOptionalOverviewMonth(searchParams.get("month"));
  if (month) return overviewMonthToDateRange(month);
  const defaults = defaultOverviewDateRange();
  return {
    dateFrom: parseOptionalOverviewDate(searchParams.get("dateFrom")) ?? defaults.dateFrom,
    dateTo: parseOptionalOverviewDate(searchParams.get("dateTo")) ?? defaults.dateTo,
  };
}

export function overviewDateRangeLabel(range: OverviewDateRange): string {
  if (range.dateFrom === range.dateTo) return range.dateFrom;
  return `${range.dateFrom} – ${range.dateTo}`;
}

export function buildOverviewDateQuery(range: OverviewDateRange): string {
  const qs = new URLSearchParams();
  qs.set("dateFrom", range.dateFrom);
  qs.set("dateTo", range.dateTo);
  return qs.toString();
}

export function buildOverviewMonthQuery(month: string): string {
  const qs = new URLSearchParams();
  qs.set("month", month);
  return qs.toString();
}

export const EMPTY_OVERVIEW_DATE_RANGE: OverviewDateRange = {
  dateFrom: "",
  dateTo: "",
};
