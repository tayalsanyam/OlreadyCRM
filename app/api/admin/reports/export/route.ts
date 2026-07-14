import { requireRoles } from "@/lib/api-auth";
import { sql } from "@/db/index";
import { rowsToCsv } from "@/lib/csv";
import { toDbStatus } from "@/lib/db-mappers";
import { exportCell } from "@/lib/export-mappers";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { toDbTier } from "@/lib/report-utils";

const HEADERS = [
  "Display ID",
  "Bride Name",
  "Phone",
  "City",
  "Region",
  "Budget Tier",
  "Event Date",
  "Days to Event",
  "Status",
  "Urgency Band",
  "Source",
  "Assigned RM",
  "Confirmation",
  "Intake Profiles",
  "Days Since Assignment",
  "MUAs Offered (count)",
  "MUA Names",
  "MUA Push Stages",
  "Booked MUA",
  "Booking Value",
] as const;

function mapLeadRow(r: Record<string, unknown>): unknown[] {
  return [
    exportCell(r, "displayId", "display_id"),
    exportCell(r, "brideName", "bride_name"),
    exportCell(r, "phone"),
    exportCell(r, "city"),
    exportCell(r, "region"),
    exportCell(r, "budgetTier", "budget_tier"),
    exportCell(r, "eventDate", "event_date"),
    exportCell(r, "daysToEvent", "days_to_event"),
    exportCell(r, "status"),
    exportCell(r, "urgencyBand", "urgency_band"),
    exportCell(r, "source"),
    exportCell(r, "assignedRm", "assigned_rm"),
    exportCell(r, "confirmationStatus", "confirmation_status"),
    exportCell(r, "intakeProfilesCount", "intake_profiles_count"),
    exportCell(r, "daysSinceAssignment", "days_since_assignment"),
    exportCell(r, "muasOffered", "muas_offered"),
    exportCell(r, "muaNames", "mua_names"),
    exportCell(r, "muaPushStages", "mua_push_stages"),
    exportCell(r, "bookedMua", "booked_mua"),
    exportCell(r, "bookingValue", "booking_value"),
  ];
}

function csvDownload(csv: string, filename: string): Response {
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function filterMockLeads(
  leads: ReturnType<typeof mockStore.getReports>["leads"],
  region: string | null,
  statusFilter: string | null
) {
  return leads.filter((l) => {
    if (region && l.region !== region) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return new Response(auth.error, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region") || null;
  const tier = toDbTier(searchParams.get("tier"));
  const statusRaw = searchParams.get("status");
  const dbStatus = statusRaw ? toDbStatus(statusRaw) : null;
  const eventFrom = searchParams.get("eventFrom") || null;
  const eventTo = searchParams.get("eventTo") || null;

  if (USE_MOCK) {
    const leads = filterMockLeads(
      mockStore.getReports().leads,
      region,
      statusRaw
    );
    const rows = leads.map((l) => [
      l.displayId,
      l.brideName,
      l.phone,
      l.city,
      l.region,
      l.budgetTier,
      l.eventDate,
      l.daysToEvent,
      l.status,
      l.urgencyBand,
      l.source ?? "",
      l.assignedRmName ?? "",
      l.daysSinceAssignment ?? "",
      l.activePushesCount,
      "",
      "",
      "",
      "",
    ]);
    return csvDownload(rowsToCsv([...HEADERS], rows), "olready-leads-export.csv");
  }

  try {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT
        bl.display_id AS "displayId",
        bl.bride_name AS "brideName",
        bl.phone,
        bl.city,
        bl.region::text AS region,
        bl.budget_tier::text AS "budgetTier",
        bl.event_date::text AS "eventDate",
        bl.status::text AS status,
        bl.source,
        rm.compute_urgency_band(bl.event_date)::text AS "urgencyBand",
        (bl.event_date - CURRENT_DATE) AS "daysToEvent",
        (CURRENT_DATE - bl.assignment_date) AS "daysSinceAssignment",
        s.name AS "assignedRm",
        bl.confirmation_status::text AS "confirmationStatus",
        (
          SELECT COUNT(DISTINCT mp3.mua_id)::int
          FROM mua_pushes mp3
          WHERE mp3.lead_id = bl.id
            AND mp3.status NOT IN ('closed', 'booked')
            AND (
              bl.owner_assigned_at IS NULL
              OR mp3.created_at >= bl.owner_assigned_at
            )
        ) AS "intakeProfilesCount",
        COUNT(DISTINCT mp.mua_id)::int AS "muasOffered",
        STRING_AGG(DISTINCT m.name, ', ' ORDER BY m.name) AS "muaNames",
        STRING_AGG(
          m.name || ' (' || REPLACE(mp.stage::text, '_', ' ') || ')',
          '; ' ORDER BY m.name
        ) FILTER (WHERE m.id IS NOT NULL) AS "muaPushStages",
        (SELECT m2.name FROM bookings b
          JOIN muas m2 ON m2.id = b.mua_id
          WHERE b.lead_id = bl.id AND NOT COALESCE(b.cancelled, false) LIMIT 1) AS "bookedMua",
        (SELECT b.booked_price FROM bookings b
          WHERE b.lead_id = bl.id AND NOT COALESCE(b.cancelled, false) LIMIT 1)
          AS "bookingValue"
      FROM bride_leads bl
      LEFT JOIN staff s ON s.id = bl.assigned_rm_id
      LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id
      LEFT JOIN muas m ON m.id = mp.mua_id
      WHERE 1=1
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${tier}::text IS NULL OR bl.budget_tier = ${tier}::budget_tier)
      AND (${dbStatus}::text IS NULL OR bl.status = ${dbStatus}::lead_status)
      AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
      AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
      GROUP BY bl.id, s.name, bl.confirmation_status
      ORDER BY bl.event_date ASC
    `;

    const data = rows.map((r) => mapLeadRow(r));
    const date = new Date().toISOString().slice(0, 10);
    return csvDownload(
      rowsToCsv([...HEADERS], data),
      `olready-leads-export-${date}.csv`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return new Response(msg, { status: 500 });
  }
}
