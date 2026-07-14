export type EventDatePreset =
  | "thisMonth"
  | "lastMonth"
  | "next30Days"
  | "next90Days";

export type EventDateFilterValue =
  | { mode: "all" }
  | { mode: "preset"; preset: EventDatePreset }
  | { mode: "range"; from?: string; to?: string };

export const EVENT_DATE_PRESETS: {
  id: EventDatePreset;
  label: string;
}[] = [
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "next30Days", label: "Next 30 days" },
  { id: "next90Days", label: "Next 90 days" },
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

function next30DaysRange(): { from: string; to: string } {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function next90DaysRange(): { from: string; to: string } {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 89);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

/** Inclusive bounds on event_date (YYYY-MM-DD). */
export function eventDateBounds(value: EventDateFilterValue): {
  from?: string;
  to?: string;
} {
  if (value.mode === "all") return {};
  if (value.mode === "preset") {
    const map = {
      thisMonth: thisMonthRange,
      lastMonth: lastMonthRange,
      next30Days: next30DaysRange,
      next90Days: next90DaysRange,
    } as const;
    return map[value.preset]();
  }
  if (value.mode === "range") {
    return { from: value.from || undefined, to: value.to || undefined };
  }
  return {};
}
