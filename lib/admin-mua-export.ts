import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import type { AdminMuaListFilters } from "@/lib/admin-muas-query";
import { fetchAdminMuaListPage } from "@/lib/admin-mua-list-fetch";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { ADMIN_MUA_SEGMENT_LABELS } from "@/lib/admin-muas-query";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { csvDateCell } from "@/lib/utils";
import type { Sql } from "@/db/index";

const EXPORT_MAX_ROWS = 5000;

export const ADMIN_MUA_EXPORT_HEADERS = [
  "Display ID",
  "MUA Name",
  "City",
  "Source",
  "Roster Status",
  "Segment",
  "Plan Tier",
  "Plan Expiry",
  "Pipeline Type",
  "Stage",
  "Sales RM",
  "Days Unassigned",
  "Days Since Stage Update",
  "Plan RM",
  "Total Bookings",
  "Total Pushes",
  "Revenue",
] as const;

export async function fetchAdminMuaListForExport(
  db: Sql,
  filters: AdminMuaListFilters,
): Promise<AdminMuaListItem[]> {
  const result = await fetchAdminMuaListPage(db, {
    ...filters,
    page: 1,
    pageSize: EXPORT_MAX_ROWS,
  });
  return result.items;
}

export function adminMuaListItemToExportRow(m: AdminMuaListItem): unknown[] {
  return [
    m.displayId,
    m.name,
    m.city,
    m.source ?? "",
    m.status,
    ADMIN_MUA_SEGMENT_LABELS[m.segment],
    m.planTier ? PLAN_TIER_LABELS[m.planTier] : "",
    csvDateCell(m.planExpiry),
    m.salesPipelineMuaType ? salesPipelineMuaTypeLabel(m.salesPipelineMuaType) : "",
    m.salesPipelineStage ?? "",
    m.salesRmName ?? "Unassigned",
    m.daysUnassigned ?? "",
    m.daysSinceStageUpdate ?? "",
    m.planRmName ?? "",
    m.totalBookings ?? 0,
    m.totalPushes ?? 0,
    m.totalBookingRevenue ?? 0,
  ];
}
