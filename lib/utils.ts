import type { BudgetTier, LeadFull, UrgencyBand } from "./types";

const TIER_ORDER: Record<BudgetTier, number> = {
  tier1: 4,
  tier2: 3,
  tier3: 2,
  tier4: 1,
};

const BAND_ORDER: Record<UrgencyBand, number> = {
  critical: 4,
  hot: 3,
  active: 2,
  longShelf: 1,
};

export function sortLeads(leads: LeadFull[]): LeadFull[] {
  return [...leads].sort((a, b) => {
    const bandDiff = BAND_ORDER[b.urgencyBand] - BAND_ORDER[a.urgencyBand];
    if (bandDiff !== 0) return bandDiff;
    const tierDiff = TIER_ORDER[b.budgetTier] - TIER_ORDER[a.budgetTier];
    if (tierDiff !== 0) return tierDiff;
    return a.daysToEvent - b.daysToEvent;
  });
}

const IST = "Asia/Kolkata";

/** Serialize DB timestamps for JSON (Date objects must not use String(date)). */
export function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return "";
  return String(value);
}

/** Format a DB date/timestamp for CSV cells (`YYYY-MM-DD`). */
export function csvDateCell(value: unknown): string {
  const iso = toIsoTimestamp(value);
  return iso ? iso.slice(0, 10) : "";
}

/** Format a DB timestamp for CSV cells (`YYYY-MM-DD HH:mm`). */
export function csvDateTimeCell(value: unknown): string {
  const iso = toIsoTimestamp(value);
  return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

/** Parse YYYY-MM-DD as a calendar date (no UTC day shift). */
export function parseCalendarDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
}

export function formatDateTime(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  });
}

export function formatDate(d: string | null): string {
  if (!d) return "—";
  const ymd = d.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, day] = ymd.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}

/** Postgres arrays / string_agg may arrive as string, array, or null. */
export function coerceStringArray(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map((x) => String(x)).filter(Boolean);
  if (typeof val === "string") {
    const t = val.trim();
    if (!t || t === "{}") return [];
    if (t.startsWith("{") && t.endsWith("}")) {
      return t
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }
    return [t];
  }
  return [];
}

export function formatLabelsList(
  labels: string[] | string | null | undefined
): string {
  const arr = coerceStringArray(labels);
  return arr.length ? arr.join(", ") : "—";
}

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
