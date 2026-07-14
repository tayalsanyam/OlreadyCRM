import type { BudgetTier, LeadStatus, Region } from "@/lib/types";
import { BUDGET_TIER_LABELS } from "@/lib/types";

export type AdminExpiredLeadRow = {
  id: string;
  displayId: string;
  brideName: string;
  region: Region;
  eventDate: string;
  budgetTier: BudgetTier;
  budgetAmount: number | null;
  status: LeadStatus;
  expiredAt: string | null;
  lastRouting: string | null;
  lastRmName: string | null;
  muaPushCount: number;
  lastContactAt: string | null;
  lastContactChannel: string | null;
};

export function expiredLeadLastRmLabel(row: AdminExpiredLeadRow): string {
  if (!row.lastRouting) return "—";
  if (row.lastRouting === "RM pool") return "RM pool · Not assigned";
  if (row.lastRouting === "Portal") return "Portal";
  if (row.lastRmName) return `${row.lastRouting} · ${row.lastRmName}`;
  return row.lastRouting;
}

export function expiredLeadBudgetLabel(row: AdminExpiredLeadRow): string {
  const parts: string[] = [];
  if (row.budgetAmount != null) {
    parts.push(`Rs. ${row.budgetAmount.toLocaleString("en-IN")}`);
  }
  if (row.budgetTier) {
    parts.push(BUDGET_TIER_LABELS[row.budgetTier]);
  }
  return parts.length ? parts.join(" · ") : "—";
}
