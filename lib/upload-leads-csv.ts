import { rowsToCsv } from "@/lib/csv";
import { BUDGET_TIER_LABELS, LEAD_STATUS_LABELS, type BrideLead } from "@/lib/types";
import { csvDateCell } from "@/lib/utils";

export type UploadLeadCsvRow = BrideLead & {
  eventCount?: number;
  ceremonies?: string | null;
  handoverReason?: string | null;
  assignedRmName?: string | null;
};

function closureNote(row: UploadLeadCsvRow): string {
  if (row.hostileNote?.trim()) return row.hostileNote.trim();
  return row.handoverReason?.trim() ?? "";
}

export function uploadLeadsToCsv(tab: "review" | "closed", rows: UploadLeadCsvRow[]): string {
  const headers =
    tab === "review"
      ? [
          "Display ID",
          "Bride",
          "Phone",
          "City",
          "Region",
          "Event date",
          "Ceremonies",
          "Budget tier",
          "Status",
          "Exit note",
          "Connect attempts",
          "Added",
        ]
      : [
          "Display ID",
          "Bride",
          "Phone",
          "City",
          "Region",
          "Event date",
          "Ceremonies",
          "Budget tier",
          "Status",
          "Closure reason",
          "Added",
        ];

  const data = rows.map((r) => {
    const row = [
      r.displayId,
      r.brideName,
      r.phone ?? "",
      r.city ?? "",
      r.region,
      csvDateCell(r.eventDate),
      r.ceremonies ?? "",
      BUDGET_TIER_LABELS[r.budgetTier] ?? r.budgetTier,
      LEAD_STATUS_LABELS[r.status] ?? r.status,
      closureNote(r),
    ];
    if (tab === "review") {
      row.push(String(r.verificationConnectAttempts ?? 0));
    }
    row.push(csvDateCell(r.createdAt));
    return row;
  });

  return rowsToCsv(headers, data);
}
