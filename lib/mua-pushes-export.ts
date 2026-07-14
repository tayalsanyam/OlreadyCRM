import { BUDGET_TIER_LABELS, URGENCY_LABELS, type MuaPushLeadRow } from "@/lib/types";

export const MUA_PUSHES_CSV_HEADERS = [
  "Bride Name",
  "Lead ID",
  "Budget Tier",
  "Urgency",
  "Push Stage",
  "Push Status",
  "Event Date",
  "Assigned RM",
  "Pushed At",
  "Last Updated",
] as const;

function formatPushStage(stage: string): string {
  return stage.replace(/([A-Z])/g, " $1").trim();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export function muaPushesToCsvRows(rows: MuaPushLeadRow[]): unknown[][] {
  return rows.map((p) => [
    p.brideName,
    p.displayId,
    BUDGET_TIER_LABELS[p.budgetTier] ?? p.budgetTier,
    URGENCY_LABELS[p.urgencyBand] ?? p.urgencyBand,
    formatPushStage(String(p.stage)),
    p.status,
    p.eventDate ? String(p.eventDate).slice(0, 10) : "",
    p.rmName ?? "",
    formatDateTime(p.createdAt),
    formatDateTime(p.updatedAt),
  ]);
}
