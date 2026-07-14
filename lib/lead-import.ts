import { resolveBudgetTierFromAmount } from "@/lib/budget-tier";
import type { BudgetTier, Region } from "@/lib/types";
import { parseCalendarDate } from "@/lib/utils";

export const LEAD_TEMPLATE_HEADERS = [
  "bride_name",
  "phone",
  "email",
  "event_date",
  "city",
  "region",
  "event_location",
  "budget_amount",
  "budget_tier",
  "source",
  "ceremonies",
] as const;

export type LeadFieldKey =
  | "brideName"
  | "phone"
  | "email"
  | "eventDate"
  | "city"
  | "region"
  | "eventLocation"
  | "budgetAmount"
  | "budgetTier"
  | "source"
  | "ceremonies"
  | "skip";

export const LEAD_FIELD_OPTIONS: {
  key: LeadFieldKey;
  label: string;
  required?: boolean;
}[] = [
  { key: "brideName", label: "Bride name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email" },
  { key: "eventDate", label: "Event date" },
  { key: "city", label: "City", required: true },
  { key: "region", label: "Region" },
  { key: "eventLocation", label: "Event location" },
  { key: "budgetAmount", label: "Budget amount" },
  { key: "budgetTier", label: "Budget tier" },
  { key: "source", label: "Source" },
  { key: "ceremonies", label: "Ceremonies" },
  { key: "skip", label: "(Skip this column)" },
];

const AUTO_MAP: Record<LeadFieldKey, string[]> = {
  brideName: ["bride_name", "name", "bride", "bride name", "full_name"],
  phone: ["phone", "mobile", "contact", "phone_number", "mobile_number"],
  email: ["email", "e-mail", "email_address"],
  eventDate: ["event_date", "date", "wedding_date", "event date", "wedding date"],
  city: ["city", "location", "town"],
  region: ["region", "area", "zone", "rm_region"],
  eventLocation: ["event_location", "venue", "event location"],
  budgetAmount: ["budget_amount", "budget", "amount", "budget amount"],
  budgetTier: ["budget_tier", "tier", "budget tier"],
  source: ["source", "lead_source", "channel"],
  ceremonies: ["ceremonies", "events", "ceremony", "functions"],
  skip: [],
};

const KNOWN_CEREMONIES = ["haldi", "mehndi", "sangeet", "wedding", "reception"];
const REGIONS: Region[] = ["north", "east", "west", "south"];

export function autoMapLeadColumns(headers: string[]): Record<string, LeadFieldKey> {
  const mapping: Record<string, LeadFieldKey> = {};
  const used = new Set<LeadFieldKey>();

  for (const header of headers) {
    const norm = header.trim().toLowerCase().replace(/\s+/g, "_");
    let matched: LeadFieldKey = "skip";
    for (const [key, aliases] of Object.entries(AUTO_MAP) as [LeadFieldKey, string[]][]) {
      if (key === "skip") continue;
      if (aliases.some((a) => norm === a || norm.includes(a))) {
        if (!used.has(key)) {
          matched = key;
          used.add(key);
        }
        break;
      }
    }
    mapping[header] = matched;
  }
  return mapping;
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^91/, "").slice(-10);
}

export function parseRegion(raw: string): Region | null {
  const s = raw.trim().toLowerCase();
  if (REGIONS.includes(s as Region)) return s as Region;
  const abbr: Record<string, Region> = { n: "north", e: "east", w: "west", s: "south" };
  return abbr[s] ?? null;
}

export function parseBudgetTier(raw: string): BudgetTier | null {
  const s = raw.trim().toLowerCase();
  if (/^tier[_\s-]?1$|^t1$/.test(s) || /above\s*1\s*l/.test(s)) return "tier1";
  if (/^tier[_\s-]?2$|^t2$/.test(s) || /50\s*k.*1\s*l|50k-1/.test(s)) return "tier2";
  if (/^tier[_\s-]?3$|^t3$/.test(s) || /25.*50/.test(s)) return "tier3";
  if (/^tier[_\s-]?4$|^t4$/.test(s) || /below\s*25/.test(s)) return "tier4";
  if (s === "tier1" || s === "tier_1") return "tier1";
  if (s === "tier2" || s === "tier_2") return "tier2";
  if (s === "tier3" || s === "tier_3") return "tier3";
  if (s === "tier4" || s === "tier_4") return "tier4";
  return null;
}

export function parseCeremonies(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[/+,&|]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const low = p.toLowerCase();
      const match = KNOWN_CEREMONIES.find((c) => low.includes(c));
      return match
        ? match.charAt(0).toUpperCase() + match.slice(1)
        : p.charAt(0).toUpperCase() + p.slice(1);
    });
}

export type RowStatus = "ready" | "warning" | "error";

export interface LeadImportIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidatedLeadRow {
  rowIndex: number;
  status: RowStatus;
  issues: LeadImportIssue[];
  brideName: string;
  phone: string;
  email: string | null;
  eventDate: string | null;
  city: string;
  region: Region | null;
  eventLocation: string | null;
  budgetAmount: number | null;
  budgetTier: BudgetTier;
  source: string | null;
  ceremonies: string[];
  raw: Record<string, string>;
}

export function mapRowToLead(
  raw: Record<string, string>,
  columnMap: Record<string, LeadFieldKey>,
  rowIndex: number
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [csvCol, field] of Object.entries(columnMap)) {
    if (field === "skip") continue;
    const val = raw[csvCol] ?? "";
    const camelMap: Record<LeadFieldKey, string> = {
      brideName: "brideName",
      phone: "phone",
      email: "email",
      eventDate: "eventDate",
      city: "city",
      region: "region",
      eventLocation: "eventLocation",
      budgetAmount: "budgetAmount",
      budgetTier: "budgetTier",
      source: "source",
      ceremonies: "ceremonies",
      skip: "skip",
    };
    out[camelMap[field]] = val;
  }
  out._rowIndex = String(rowIndex);
  return out as unknown as Record<string, string>;
}

export function validateLeadRow(
  data: {
    brideName?: string;
    phone?: string;
    email?: string;
    eventDate?: string;
    city?: string;
    region?: string;
    eventLocation?: string;
    budgetAmount?: string;
    budgetTier?: string;
    source?: string;
    ceremonies?: string;
  },
  rowIndex: number,
  raw: Record<string, string>
): ValidatedLeadRow {
  const issues: LeadImportIssue[] = [];

  const brideName = (data.brideName ?? "").trim();
  if (!brideName) {
    issues.push({ field: "Bride name", message: "Required", severity: "error" });
  }

  const phoneNorm = normalizePhone(data.phone ?? "");
  if (!phoneNorm) {
    issues.push({ field: "Phone", message: "Required", severity: "error" });
  } else if (!/^[6-9]\d{9}$/.test(phoneNorm)) {
    issues.push({
      field: "Phone",
      message: "Invalid format (must be 10 digits starting with 6-9)",
      severity: "error",
    });
  }

  const eventDateStr = (data.eventDate ?? "").trim();
  let eventDate: string | null = null;
  if (!eventDateStr) {
    issues.push({
      field: "Event date",
      message: "Will be confirmed at verification",
      severity: "warning",
    });
  } else {
    const parsed = parseCalendarDate(eventDateStr);
    if (!parsed) {
      issues.push({ field: "Event date", message: "Invalid date", severity: "error" });
    } else {
      eventDate = parsed;
      const [y, m, d] = parsed.split("-").map(Number);
      const eventDay = new Date(y, m - 1, d);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = (eventDay.getTime() - today.getTime()) / 86400000;
      if (diff < 0) {
        issues.push({
          field: "Event date",
          message: "Date is in the past",
          severity: "error",
        });
      } else if (diff <= 7) {
        issues.push({
          field: "Event date",
          message: "Event within 7 days",
          severity: "warning",
        });
      }
    }
  }

  const city = (data.city ?? "").trim();
  if (!city) {
    issues.push({ field: "City", message: "Required", severity: "error" });
  }

  const regionRaw = (data.region ?? "").trim();
  let region: Region | null = null;
  if (regionRaw) {
    region = parseRegion(regionRaw);
    if (!region) {
      issues.push({
        field: "Region",
        message: "Must be north, east, west, or south",
        severity: "error",
      });
    }
  } else {
    issues.push({
      field: "Region",
      message: "Will be confirmed at verification",
      severity: "warning",
    });
  }

  let budgetTier: BudgetTier = "tier1";
  const amountRaw = (data.budgetAmount ?? "").trim().replace(/,/g, "");
  const amount = amountRaw ? Number(amountRaw) : NaN;
  if (Number.isFinite(amount) && amount > 0) {
    budgetTier = resolveBudgetTierFromAmount(amount);
  }
  const tierRaw = (data.budgetTier ?? "").trim();
  if (tierRaw) {
    issues.push({
      field: "Budget tier",
      message: "Tier is set automatically from budget amount at verification",
      severity: "warning",
    });
  }

  const ceremonies = parseCeremonies(data.ceremonies ?? "");
  if ((data.ceremonies ?? "").trim()) {
    const parts = (data.ceremonies ?? "").split(/[/+,&|]+/).map((p) => p.trim());
    for (const p of parts) {
      if (p && !KNOWN_CEREMONIES.some((c) => p.toLowerCase().includes(c))) {
        issues.push({
          field: "Ceremonies",
          message: `Unrecognised ceremony: ${p}`,
          severity: "warning",
        });
      }
    }
  }

  const source = (data.source ?? "").trim() || null;
  if (!source) {
    issues.push({
      field: "Source",
      message: "Source not provided",
      severity: "warning",
    });
  }

  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");
  const status: RowStatus = hasError ? "error" : hasWarning ? "warning" : "ready";

  return {
    rowIndex,
    status,
    issues,
    brideName,
    phone: phoneNorm,
    email: (data.email ?? "").trim() || null,
    eventDate,
    city,
    region,
    eventLocation: (data.eventLocation ?? "").trim() || null,
    budgetAmount:
      Number.isFinite(amount) && amount > 0 ? amount : null,
    budgetTier,
    source,
    ceremonies: ceremonies.length ? ceremonies : ["Wedding"],
    raw,
  };
}

export function validateAllLeads(
  records: Record<string, string>[],
  columnMap: Record<string, LeadFieldKey>
): ValidatedLeadRow[] {
  return records.map((raw, i) => {
    const mapped: Record<string, string> = {};
    for (const [col, field] of Object.entries(columnMap)) {
      if (field === "skip") continue;
      mapped[field] = raw[col] ?? "";
    }
    return validateLeadRow(
      {
        brideName: mapped.brideName,
        phone: mapped.phone,
        email: mapped.email,
        eventDate: mapped.eventDate,
        city: mapped.city,
        region: mapped.region,
        eventLocation: mapped.eventLocation,
        budgetAmount: mapped.budgetAmount,
        budgetTier: mapped.budgetTier,
        source: mapped.source,
        ceremonies: mapped.ceremonies,
      },
      i + 1,
      raw
    );
  });
}

export function requiredLeadFieldsMapped(
  columnMap: Record<string, LeadFieldKey>
): LeadFieldKey[] {
  const required: LeadFieldKey[] = ["brideName", "phone", "city"];
  const mapped = new Set(Object.values(columnMap));
  return required.filter((r) => !mapped.has(r));
}
