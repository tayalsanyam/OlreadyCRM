import { toDbStatus, toDbTier } from "@/lib/db-mappers";
import type { BudgetTier, LeadStatus, Region } from "@/lib/types";

const REGIONS: Region[] = ["north", "east", "west", "south"];
const TIERS: BudgetTier[] = ["tier1", "tier2", "tier3", "tier4"];
const ASSIGNED_STATUSES: LeadStatus[] = ["assigned", "commissionRm", "booked"];

export function parseAssignLeadsRegion(value: string | null): Region | null {
  if (!value) return null;
  return REGIONS.includes(value as Region) ? (value as Region) : null;
}

export function parseAssignLeadsTier(value: string | null): BudgetTier | null {
  if (!value) return null;
  return TIERS.includes(value as BudgetTier) ? (value as BudgetTier) : null;
}

export function assignLeadsTierDb(value: string | null): string | null {
  const tier = parseAssignLeadsTier(value);
  return tier ? toDbTier(tier) : null;
}

export function parseAssignLeadsDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

/** Indian state name from city_regions (e.g. Maharashtra). */
export function parseAssignLeadsState(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAssignLeadsStatus(value: string | null): LeadStatus | null {
  if (!value) return null;
  return ASSIGNED_STATUSES.includes(value as LeadStatus)
    ? (value as LeadStatus)
    : null;
}
