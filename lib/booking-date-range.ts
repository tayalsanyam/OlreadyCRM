export type BookingDatePreset =
  | "thisMonth"
  | "lastMonth"
  | "last30Days"
  | "thisYear";

export type BookingDateFilterValue =
  | { mode: "all" }
  | { mode: "preset"; preset: BookingDatePreset }
  | { mode: "range"; from?: string; to?: string };

export const BOOKING_DATE_PRESETS: {
  id: BookingDatePreset;
  label: string;
}[] = [
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "last30Days", label: "Last 30 days" },
  { id: "thisYear", label: "This year" },
];

function padYm(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function firstDayOfMonth(ym: string): string {
  return `${ym}-01`;
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

function thisMonthRange(): { from: string; to: string } {
  const ym = padYm(new Date());
  return { from: firstDayOfMonth(ym), to: lastDayOfMonth(ym) };
}

function lastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym = padYm(d);
  return { from: firstDayOfMonth(ym), to: lastDayOfMonth(ym) };
}

function last30DaysRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function thisYearRange(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Inclusive bounds on booking_date (YYYY-MM-DD). */
export function bookingDateBounds(value: BookingDateFilterValue): {
  from?: string;
  to?: string;
} {
  if (value.mode === "all") return {};
  if (value.mode === "preset") {
    const map = {
      thisMonth: thisMonthRange,
      lastMonth: lastMonthRange,
      last30Days: last30DaysRange,
      thisYear: thisYearRange,
    } as const;
    return map[value.preset]();
  }
  if (value.mode === "range") {
    return { from: value.from || undefined, to: value.to || undefined };
  }
  return {};
}
