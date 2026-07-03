/** Shared filter parsing for admin sales report APIs. */

export type AdminSalesReportFilters = {
  stage: string | null;
  muaType: string | null;
  source: string | null;
  city: string | null;
  assignedTo: string | null;
  teamId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  q: string | null;
  unassignedOnly: boolean;
  assignedOnly: boolean;
  month: string | null;
};

export function parseAdminSalesReportFilters(
  searchParams: URLSearchParams
): AdminSalesReportFilters {
  const monthRaw = searchParams.get("month");
  const month =
    monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null;

  return {
    stage: searchParams.get("stage") || null,
    muaType: searchParams.get("mua_type") || null,
    source: searchParams.get("source") || null,
    city: searchParams.get("city") || null,
    assignedTo: searchParams.get("assigned_to") || null,
    teamId: searchParams.get("team_id") || null,
    dateFrom: searchParams.get("date_from") || null,
    dateTo: searchParams.get("date_to") || null,
    q: searchParams.get("q")?.trim() || null,
    unassignedOnly: searchParams.get("unassigned_only") === "1",
    assignedOnly: searchParams.get("assigned_only") === "1",
    month,
  };
}

export function effectiveSalesMonth(filters: AdminSalesReportFilters): string {
  return filters.month ?? new Date().toISOString().slice(0, 7);
}
