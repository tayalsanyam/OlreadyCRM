import { PLAN_TIER_TO_LABEL } from "@/lib/admin-plan-assign-shared";
import { inferRegionFromCity, parseRegionsList } from "@/lib/mua-region";
import { isCompletePlanDetails } from "@/lib/sales-plan-details";
import type { PlanTier, Region } from "@/lib/types";

export type MuaImportProfile = "prospect" | "roster" | "plan_customer";

export const MUA_IMPORT_PROFILE_LABELS: Record<MuaImportProfile, string> = {
  prospect: "Sales prospect",
  roster: "Roster / migration",
  plan_customer: "Plan customer",
};

export const MUA_IMPORT_PROFILE_HINTS: Record<MuaImportProfile, string> = {
  prospect:
    "New leads for sales. Requires name, phone, city. Creates unassigned sales pipeline.",
  roster:
    "Bulk roster load. Name + city required. Phone recommended. Optional basic plan columns.",
  plan_customer:
    "MUAs already on plan. Requires full plan details (tier, expiry, cap, budget, coverage, Instagram).",
};

export const MUA_TEMPLATE_HEADERS = [
  "name",
  "city",
  "phone",
  "source",
  "instagram",
  "whatsapp",
  "bio",
  "email",
  "regions",
  "plan_tier",
  "plan_expiry_date",
  "lead_cap",
  "lead_budget",
  "plan_states",
  "plan_regions",
  "plan_cities",
] as const;

export type MuaFieldKey =
  | "name"
  | "city"
  | "regions"
  | "phone"
  | "email"
  | "source"
  | "instagram"
  | "whatsapp"
  | "bio"
  | "planTier"
  | "planExpiry"
  | "leadCap"
  | "leadBudget"
  | "planStates"
  | "planRegions"
  | "planCities"
  | "skip";

export const MUA_FIELD_OPTIONS: {
  key: MuaFieldKey;
  label: string;
  required?: boolean;
}[] = [
  { key: "name", label: "MUA name", required: true },
  { key: "city", label: "City / primary city", required: true },
  { key: "phone", label: "Phone" },
  { key: "source", label: "Source (Inbound, Ads, …)" },
  { key: "instagram", label: "Instagram / social" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "bio", label: "Bio" },
  { key: "email", label: "Email" },
  { key: "regions", label: "Regions (north, west, or all)" },
  { key: "planTier", label: "Plan tier" },
  { key: "planExpiry", label: "Plan expiry date" },
  { key: "leadCap", label: "Lead cap" },
  { key: "leadBudget", label: "Lead budget (Tier 1–4)" },
  { key: "planStates", label: "Plan states (comma-separated)" },
  { key: "planRegions", label: "Plan regions (comma-separated)" },
  { key: "planCities", label: "Plan cities (comma-separated)" },
  { key: "skip", label: "(Skip this column)" },
];

const AUTO_MAP: Record<MuaFieldKey, string[]> = {
  name: ["name", "mua_name", "mua name", "artist"],
  city: ["city", "location", "primary_city"],
  regions: ["region", "regions", "rm_region", "area"],
  phone: ["phone", "mobile", "contact"],
  email: ["email", "e-mail"],
  source: ["source", "lead_source"],
  instagram: ["instagram", "social", "social_media", "ig"],
  whatsapp: ["whatsapp", "wa"],
  bio: ["bio", "about", "description"],
  planTier: ["plan_tier", "plan", "tier", "plan tier"],
  planExpiry: [
    "plan_expiry_date",
    "plan_expiry",
    "expiry",
    "expiry_date",
    "valid_until",
    "duration_end",
  ],
  leadCap: ["lead_cap", "leads_cap"],
  leadBudget: ["lead_budget", "budget_tier"],
  planStates: ["plan_states", "states"],
  planRegions: ["plan_regions"],
  planCities: ["plan_cities", "coverage_cities", "cities"],
  skip: [],
};

export function autoMapMuaColumns(headers: string[]): Record<string, MuaFieldKey> {
  const mapping: Record<string, MuaFieldKey> = {};
  const used = new Set<MuaFieldKey>();
  for (const header of headers) {
    const norm = header.trim().toLowerCase().replace(/\s+/g, "_");
    let matched: MuaFieldKey = "skip";
    for (const [key, aliases] of Object.entries(AUTO_MAP) as [MuaFieldKey, string[]][]) {
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

export function parsePlanTier(raw: string): PlanTier | null {
  const s = raw.trim().toLowerCase();
  if (/highest|privy/.test(s)) return "highestPrivy";
  if (/phoenix\s*2|phoenix2|phoenix_2/.test(s)) return "phoenix2";
  if (/^phoenix$/.test(s)) return "phoenix";
  if (/^pro$/.test(s)) return "pro";
  if (/^prime$/.test(s)) return "prime";
  if (s === "highestprivy" || s === "highest_privy") return "highestPrivy";
  return null;
}

export function parseExpiryDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (iso) return s;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^91/, "").slice(-10);
}

export function parseListField(raw: string): string[] {
  if (!raw.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export function parsePlanRegions(raw: string): Region[] {
  return parseRegionsList(raw);
}

export type MuaRowStatus = "ready" | "warning" | "error";

export interface MuaImportIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ImportMuaRowPayload {
  name: string;
  city: string;
  regions: Region[];
  phone: string | null;
  email: string | null;
  source: string | null;
  instagram: string | null;
  whatsapp: string | null;
  bio: string | null;
  planTier: PlanTier | null;
  planExpiry: string | null;
  leadCap: number | null;
  leadBudget: string | null;
  planStates: string[];
  planRegions: Region[];
  planCities: string[];
}

export interface ValidatedMuaRow extends ImportMuaRowPayload {
  rowIndex: number;
  status: MuaRowStatus;
  issues: MuaImportIssue[];
  raw: Record<string, string>;
}

export function validateMuaRow(
  data: {
    name?: string;
    city?: string;
    regions?: string;
    phone?: string;
    email?: string;
    source?: string;
    instagram?: string;
    whatsapp?: string;
    bio?: string;
    planTier?: string;
    planExpiry?: string;
    leadCap?: string;
    leadBudget?: string;
    planStates?: string;
    planRegions?: string;
    planCities?: string;
  },
  rowIndex: number,
  raw: Record<string, string>,
  profile: MuaImportProfile,
  fileDupes?: { phones: Set<string>; instagrams: Set<string> },
): ValidatedMuaRow {
  const issues: MuaImportIssue[] = [];
  const name = (data.name ?? "").trim();
  if (!name) {
    issues.push({ field: "Name", message: "Required", severity: "error" });
  }
  const city = (data.city ?? "").trim();
  if (!city) {
    issues.push({ field: "City", message: "Required", severity: "error" });
  }

  let regions = parseRegionsList(data.regions ?? "");
  if (!regions.length && city) {
    const inferred = inferRegionFromCity(city);
    if (inferred) regions = [inferred];
  }
  if (!regions.length && city) {
    issues.push({
      field: "Regions",
      message: "Set regions or use a recognised city",
      severity: "error",
    });
  }

  let phone: string | null = null;
  const phoneRaw = (data.phone ?? "").trim();
  if (phoneRaw) {
    phone = normalizePhone(phoneRaw);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      issues.push({
        field: "Phone",
        message: "Invalid Indian mobile",
        severity: "error",
      });
    } else if (fileDupes?.phones.has(phone)) {
      issues.push({ field: "Phone", message: "Duplicate in file", severity: "error" });
    } else {
      fileDupes?.phones.add(phone);
    }
  } else if (profile === "prospect" || profile === "plan_customer") {
    issues.push({ field: "Phone", message: "Required for this profile", severity: "error" });
  } else {
    issues.push({ field: "Phone", message: "Recommended", severity: "warning" });
  }

  const instagram = (data.instagram ?? "").trim() || null;
  if (instagram && fileDupes?.instagrams.has(instagram.toLowerCase())) {
    issues.push({ field: "Instagram", message: "Duplicate in file", severity: "error" });
  } else if (instagram) {
    fileDupes?.instagrams.add(instagram.toLowerCase());
  }

  const whatsappRaw = (data.whatsapp ?? "").trim();
  let whatsapp: string | null = null;
  if (whatsappRaw) {
    const w = normalizePhone(whatsappRaw);
    whatsapp = /^[6-9]\d{9}$/.test(w) ? w : null;
    if (!whatsapp) {
      issues.push({ field: "WhatsApp", message: "Invalid number", severity: "warning" });
    }
  }

  const email = (data.email ?? "").trim() || null;
  const source = (data.source ?? "").trim() || null;
  const bio = (data.bio ?? "").trim() || null;

  let planTier: PlanTier | null = null;
  const tierRaw = (data.planTier ?? "").trim();
  if (tierRaw) {
    planTier = parsePlanTier(tierRaw);
    if (!planTier) {
      issues.push({
        field: "Plan tier",
        message: "Unrecognised plan tier",
        severity: "error",
      });
    }
  }

  let planExpiry: string | null = null;
  const expiryRaw = (data.planExpiry ?? "").trim();
  if (expiryRaw) {
    planExpiry = parseExpiryDate(expiryRaw);
    if (!planExpiry) {
      issues.push({
        field: "Plan expiry",
        message: "Invalid date format",
        severity: "error",
      });
    }
  }

  const leadCapRaw = (data.leadCap ?? "").trim();
  let leadCap: number | null = null;
  if (leadCapRaw) {
    const n = Number(leadCapRaw);
    if (!Number.isFinite(n) || n <= 0) {
      issues.push({ field: "Lead cap", message: "Must be a positive number", severity: "error" });
    } else {
      leadCap = n;
    }
  }

  const leadBudget = (data.leadBudget ?? "").trim() || null;
  const planStates = parseListField(data.planStates ?? "");
  const planRegions = parsePlanRegions(data.planRegions ?? "");
  const planCities = parseListField(data.planCities ?? "");

  if (profile === "prospect" && (planTier || planExpiry)) {
    issues.push({
      field: "Plan",
      message: "Use Plan customer profile to import with a plan",
      severity: "error",
    });
  }

  if (profile === "plan_customer") {
    if (!planTier) {
      issues.push({ field: "Plan tier", message: "Required for plan customer", severity: "error" });
    }
    if (!planExpiry) {
      issues.push({ field: "Plan expiry", message: "Required for plan customer", severity: "error" });
    }
    if (!instagram) {
      issues.push({ field: "Instagram", message: "Required for plan customer", severity: "error" });
    }
    if (planTier && planExpiry) {
      const label = PLAN_TIER_TO_LABEL[planTier];
      const complete = isCompletePlanDetails({
        plan: label,
        leadCap,
        leadBudget: leadBudget ?? "",
        states: planStates,
        regions: planRegions,
        cities: planCities.length ? planCities : city ? [city] : [],
        socialMedia: instagram ?? "",
        durationStart: new Date().toISOString().slice(0, 10),
        durationEnd: planExpiry,
      });
      if (!complete) {
        issues.push({
          field: "Plan coverage",
          message: "Full plan details required (cap, budget, states, regions, cities)",
          severity: "error",
        });
      }
    }
  }

  if (profile === "roster" && planTier && !planExpiry) {
    issues.push({
      field: "Plan expiry",
      message: "Required when plan tier is set",
      severity: "error",
    });
  }

  if (profile === "roster" && planTier && planExpiry) {
    const label = PLAN_TIER_TO_LABEL[planTier];
    const complete = isCompletePlanDetails({
      plan: label,
      leadCap,
      leadBudget: leadBudget ?? "",
      states: planStates,
      regions: planRegions,
      cities: planCities.length ? planCities : city ? [city] : [],
      socialMedia: instagram ?? "",
      durationStart: new Date().toISOString().slice(0, 10),
      durationEnd: planExpiry,
    });
    if (!complete) {
      issues.push({
        field: "Plan coverage",
        message: "Partial plan only — will import tier + expiry; complete coverage in app later",
        severity: "warning",
      });
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");
  const status: MuaRowStatus = hasError ? "error" : hasWarning ? "warning" : "ready";

  return {
    rowIndex,
    status,
    issues,
    name,
    city,
    regions,
    phone,
    email,
    source,
    instagram,
    whatsapp,
    bio,
    planTier,
    planExpiry,
    leadCap,
    leadBudget,
    planStates,
    planRegions,
    planCities,
    raw,
  };
}

export function validateAllMuas(
  records: Record<string, string>[],
  columnMap: Record<string, MuaFieldKey>,
  profile: MuaImportProfile,
): ValidatedMuaRow[] {
  const fileDupes = { phones: new Set<string>(), instagrams: new Set<string>() };
  return records.map((raw, i) => {
    const mapped: Record<string, string> = {};
    for (const [col, field] of Object.entries(columnMap)) {
      if (field === "skip") continue;
      mapped[field] = raw[col] ?? "";
    }
    return validateMuaRow(
      {
        name: mapped.name,
        city: mapped.city,
        regions: mapped.regions,
        phone: mapped.phone,
        email: mapped.email,
        source: mapped.source,
        instagram: mapped.instagram,
        whatsapp: mapped.whatsapp,
        bio: mapped.bio,
        planTier: mapped.planTier,
        planExpiry: mapped.planExpiry,
        leadCap: mapped.leadCap,
        leadBudget: mapped.leadBudget,
        planStates: mapped.planStates,
        planRegions: mapped.planRegions,
        planCities: mapped.planCities,
      },
      i + 1,
      raw,
      profile,
      fileDupes,
    );
  });
}

export function requiredMuaFieldsMapped(
  columnMap: Record<string, MuaFieldKey>,
  profile: MuaImportProfile,
): MuaFieldKey[] {
  const required: MuaFieldKey[] = ["name", "city"];
  if (profile === "prospect" || profile === "plan_customer") {
    required.push("phone");
  }
  if (profile === "plan_customer") {
    required.push(
      "planTier",
      "planExpiry",
      "instagram",
      "leadCap",
      "leadBudget",
      "planStates",
      "planRegions",
      "planCities",
    );
  }
  const mapped = new Set(Object.values(columnMap));
  return required.filter((r) => !mapped.has(r));
}

export function templateSampleRow(profile: MuaImportProfile): string[] {
  if (profile === "prospect") {
    return [
      "Jane MUA",
      "Delhi",
      "9876543210",
      "Inbound",
      "@janemua",
      "9876543210",
      "Bridal specialist",
      "",
      "north",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ];
  }
  if (profile === "plan_customer") {
    return [
      "Priya Makeup",
      "Gurgaon",
      "9123456780",
      "Referral",
      "@priyamakeup",
      "",
      "",
      "",
      "north",
      "Phoenix 2",
      "31/12/2026",
      "90",
      "Tier 2",
      "Haryana,Delhi",
      "north",
      "Gurgaon,Delhi",
    ];
  }
  return [
    "Deepa Artistry",
    "Mumbai",
    "9988776655",
    "Ads",
    "",
    "",
    "",
    "deepa@email.com",
    "west",
    "Pro",
    "30/06/2026",
    "",
    "",
    "",
    "",
    "",
  ];
}
