import type { DateRangeFilterValue } from "@/lib/types";

export function firstDayOfMonth(ym: string): string {
  return `${ym}-01`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0);
  return d.toISOString().slice(0, 10);
}

function padYm(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function quarterBounds(year: number, quarter: number): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function nextMonthRange(): { from: string; to: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ym = padYm(d);
  return { from: firstDayOfMonth(ym), to: lastDayOfMonth(ym) };
}

export function thisQuarterRange(): { from: string; to: string } {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return quarterBounds(now.getFullYear(), q);
}

export function nextQuarterRange(): { from: string; to: string } {
  const now = new Date();
  let q = Math.floor(now.getMonth() / 3) + 1;
  let year = now.getFullYear();
  q += 1;
  if (q > 4) {
    q = 1;
    year += 1;
  }
  return quarterBounds(year, q);
}

export const DATE_RANGE_PRESETS = [
  { id: "nextMonth" as const, label: "Next month" },
  { id: "thisQuarter" as const, label: "This quarter" },
  { id: "nextQuarter" as const, label: "Next quarter" },
];

export function valueFromSearchParams(
  eventFrom: string | null,
  eventTo: string | null
): DateRangeFilterValue {
  if (!eventFrom && !eventTo) return { mode: "all" };
  return { mode: "range", from: eventFrom ?? undefined, to: eventTo ?? undefined };
}

export function toSearchParams(value: DateRangeFilterValue): {
  eventFrom?: string;
  eventTo?: string;
} {
  if (value.mode === "all") return {};
  if (value.mode === "preset" && value.preset) {
    const map = {
      nextMonth: nextMonthRange,
      thisQuarter: thisQuarterRange,
      nextQuarter: nextQuarterRange,
    } as const;
    const { from, to } = map[value.preset]();
    return { eventFrom: from, eventTo: to };
  }
  if (value.mode === "range") {
    return { eventFrom: value.from, eventTo: value.to };
  }
  return {};
}
