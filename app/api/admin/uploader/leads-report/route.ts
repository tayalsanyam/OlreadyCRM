import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { defaultOverviewDateRange } from "@/lib/admin-overview-date-range";
import {
  fetchUploaderLeadsReport,
  fetchUploaderLeadsReportStates,
  fetchUploaderLeadsReportStatusCounts,
  parseUploaderLeadsReportParams,
} from "@/lib/admin-uploader-leads-report-query";
import { expireDueLeads } from "@/lib/lead-lifecycle";
import { BUDGET_TIER_LABELS } from "@/lib/types";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatLastContact(
  at: string | null,
  channel: string | null
): string {
  if (!at) return "—";
  const when = formatDate(at);
  if (channel === "whatsapp") return `${when} · WhatsApp`;
  return `${when} · Call`;
}

function formatRouting(row: {
  routing: string | null;
  assignedTo: string | null;
}): string {
  if (!row.routing) return "—";
  if (row.routing === "RM pool") return "RM pool · Not assigned";
  if (row.assignedTo && (row.routing === "RM" || row.routing === "Commission")) {
    return `${row.routing} · ${row.assignedTo}`;
  }
  return row.routing;
}

function formatBudget(row: {
  budgetAmount: number | null;
  budgetTier: string | null;
}): string {
  const parts: string[] = [];
  if (row.budgetAmount != null) {
    parts.push(`Rs. ${row.budgetAmount.toLocaleString("en-IN")}`);
  }
  if (row.budgetTier && row.budgetTier in BUDGET_TIER_LABELS) {
    parts.push(BUDGET_TIER_LABELS[row.budgetTier as keyof typeof BUDGET_TIER_LABELS]);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("meta") === "filters") {
    const states = await fetchUploaderLeadsReportStates();
    return NextResponse.json({ data: { states }, error: null });
  }

  const params = parseUploaderLeadsReportParams(
    searchParams,
    defaultOverviewDateRange()
  );

  try {
    await withTransaction(async (tx) => {
      await expireDueLeads(tx);
    });

    const [rows, statusSummary] = await Promise.all([
      fetchUploaderLeadsReport(params),
      fetchUploaderLeadsReportStatusCounts(params),
    ]);

    if (wantsCsv(request)) {
      return exportListCsv("uploader-leads-report", [
        { header: "Lead ID", value: (r) => r.displayId },
        { header: "Bride", value: (r) => r.brideName },
        { header: "Phone", value: (r) => r.phone },
        { header: "City", value: (r) => r.city },
        { header: "State", value: (r) => r.state ?? "" },
        { header: "Region", value: (r) => r.region },
        { header: "Budget", value: (r) => formatBudget(r) },
        { header: "Event date", value: (r) => (r.eventDate ? formatDate(r.eventDate) : "") },
        { header: "Expired", value: (r) => (r.isExpired ? "Yes" : "No") },
        { header: "MUA pushes", value: (r) => r.muaPushCount },
        { header: "Workspace status", value: (r) => r.workspaceStatus },
        { header: "Routing", value: (r) => formatRouting(r) },
        { header: "Assigned to", value: (r) => r.assignedTo ?? "" },
        { header: "DB status", value: (r) => r.dbStatus },
        { header: "Source", value: (r) => r.source ?? "" },
        { header: "Added", value: (r) => formatDate(r.createdAt) },
        { header: "Verified", value: (r) => (r.verifiedAt ? formatDate(r.verifiedAt) : "") },
        { header: "Contact count", value: (r) => r.contactCount },
        {
          header: "Last contact",
          value: (r) => formatLastContact(r.lastContactAt, r.lastContactChannel),
        },
        { header: "Connect attempts", value: (r) => r.verificationConnectAttempts },
      ], rows);
    }

    return NextResponse.json({
      data: {
        ...params,
        statusCounts: statusSummary.counts,
        totalInRange: statusSummary.totalInRange,
        rows,
        total: rows.length,
      },
      error: null,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load uploader leads report");
  }
}
