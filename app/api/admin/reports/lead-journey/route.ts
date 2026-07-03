import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  buildLeadJourneySummary,
  buildLeadJourneyAtStageCounts,
  enrichLeadJourneyRow,
  filterLeadsByFunnelStage,
  parseLeadJourneyFunnelStage,
  type RawLeadJourneyRow,
} from "@/lib/reports/lead-journey-shared";
import {
  LEAD_JOURNEY_CSV_HEADERS,
  leadJourneyToCsvRows,
} from "@/lib/reports/lead-journey-csv";
import {
  leadJourneyStatusFilterSqlValues,
  parseLeadJourneyDbStatusFilters,
  parseLeadJourneyPortalFilter,
} from "@/lib/reports/lead-journey-filters";
import { LEAD_LAST_CONTACT_UNION } from "@/lib/lead-contact-sql";
import { csvResponse, toDbStatusFilter, toDbTier } from "@/lib/report-utils";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const region = searchParams.get("region");
  const tier = toDbTier(searchParams.get("tier"));
  const rmId = searchParams.get("rmId");
  const eventFrom = searchParams.get("eventFrom");
  const eventTo = searchParams.get("eventTo");
  const activityFrom = searchParams.get("activityFrom");
  const activityTo = searchParams.get("activityTo");
  const status = toDbStatusFilter(searchParams.get("status"));
  const statusFilters = parseLeadJourneyDbStatusFilters(
    searchParams.get("statuses"),
    searchParams.get("status")
  );
  const { noStatusFilter, dbStatuses, includeClosed } =
    leadJourneyStatusFilterSqlValues(statusFilters);
  const portalFilter = parseLeadJourneyPortalFilter(searchParams.get("portal"));
  const portalOnly =
    portalFilter === "portal" ? true : portalFilter === "non_portal" ? false : null;
  const funnelStage = parseLeadJourneyFunnelStage(searchParams.get("funnelStage"));

  if (USE_MOCK) {
    const { leads, summary: _mockSummary } = mockStore.getLeadJourney({
      region,
      tier,
      rmId,
      eventFrom,
      eventTo,
      status,
    });
    let enrichedMock = leads.map((l) => enrichLeadJourneyRow(l as RawLeadJourneyRow));
    const atStageCounts = buildLeadJourneyAtStageCounts(enrichedMock);
    enrichedMock = filterLeadsByFunnelStage(enrichedMock, funnelStage);
    const summary = { ...buildLeadJourneySummary(enrichedMock), atStageCounts };
    if (format === "csv") {
      return csvResponse(
        "lead-journey",
        [...LEAD_JOURNEY_CSV_HEADERS],
        leadJourneyToCsvRows(enrichedMock)
      );
    }
    return NextResponse.json({ data: { leads: enrichedMock, summary }, error: null });
  }

  const rows = await sql<RawLeadJourneyRow[]>`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.region::text AS region,
      bl.budget_tier::text AS "budgetTier",
      bl.status::text AS status,
      bl.event_date::text AS "eventDate",
      bl.source,
      rm.compute_urgency_band(bl.event_date)::text AS "urgencyBand",
      s.name AS "rmName",
      bl.lead_phase::text AS "leadPhase",
      COALESCE(bl.portal_only, false) AS "portalOnly",
      (
        SELECT MAX(lc.at)
        FROM (${sql.unsafe(LEAD_LAST_CONTACT_UNION)}) lc
      ) AS "lastContactAt",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id AND c.entry_type = 'lead_created') AS "tCreated",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id AND c.entry_type = 'lead_verified') AS "tVerified",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id AND c.entry_type = 'assigned') AS "tAssigned",
      bl.requirements_confirmed_at::text AS "tConfirmed",
      bl.confirmation_status::text AS "confirmationStatus",
      (
        SELECT COUNT(DISTINCT mp2.mua_id)::int
        FROM mua_pushes mp2
        WHERE mp2.lead_id = bl.id
          AND mp2.status NOT IN ('closed', 'booked')
          AND (
            bl.owner_assigned_at IS NULL
            OR mp2.created_at >= bl.owner_assigned_at
          )
      ) AS "intakeProfilesCount",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id AND c.entry_type = 'mua_pushed') AS "tFirstPush",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id
          AND c.entry_type = 'stage_updated'
          AND (
            c.metadata->>'toStage' IN ('offerSent', 'offer_sent')
            OR c.metadata->>'stage' IN ('offerSent', 'offer_sent')
          )) AS "tOfferSent",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id
          AND c.entry_type = 'stage_updated'
          AND (
            c.metadata->>'toStage' IN ('negotiating')
            OR c.metadata->>'stage' IN ('negotiating')
          )) AS "tNegotiating",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id AND c.entry_type = 'booking_confirmed') AS "tBooked",
      (SELECT MIN(c.created_at) FROM comms c
        WHERE c.lead_id = bl.id AND c.entry_type = 'shifted_commission') AS "tShifted",
      COUNT(DISTINCT mp.mua_id)::int AS "totalMuasOffered",
      COUNT(DISTINCT mp.id)::int AS "totalPushes",
      (SELECT COUNT(*)::int FROM bookings b
        WHERE b.lead_id = bl.id AND NOT COALESCE(b.cancelled, false)) AS "bookingsCount"
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id
    WHERE (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${tier}::text IS NULL OR bl.budget_tier = ${tier}::budget_tier)
      AND (${rmId}::text IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
      AND (${eventFrom}::text IS NULL OR bl.event_date >= ${eventFrom}::date)
      AND (${eventTo}::text IS NULL OR bl.event_date <= ${eventTo}::date)
      AND (
        ${activityFrom}::text IS NULL
        OR (
          SELECT MAX(c.created_at)::date FROM comms c WHERE c.lead_id = bl.id
        ) >= ${activityFrom}::date
      )
      AND (
        ${activityTo}::text IS NULL
        OR (
          SELECT MAX(c.created_at)::date FROM comms c WHERE c.lead_id = bl.id
        ) <= ${activityTo}::date
      )
      AND (
        ${noStatusFilter}::boolean
        OR bl.status = ANY(${dbStatuses}::lead_status[])
        OR (${includeClosed}::boolean AND bl.lead_phase = 'closed')
      )
      AND (
        ${portalOnly === null}::boolean
        OR COALESCE(bl.portal_only, false) = ${portalOnly ?? false}::boolean
      )
    GROUP BY bl.id, s.name, bl.requirements_confirmed_at, bl.confirmation_status, bl.lead_phase, bl.portal_only
    ORDER BY bl.created_at DESC
  `;

  let leads = rows.map((r) => enrichLeadJourneyRow(r));
  const atStageCounts = buildLeadJourneyAtStageCounts(leads);
  leads = filterLeadsByFunnelStage(leads, funnelStage);
  const summary = { ...buildLeadJourneySummary(leads), atStageCounts };

  if (format === "csv") {
    return csvResponse(
      "lead-journey",
      [...LEAD_JOURNEY_CSV_HEADERS],
      leadJourneyToCsvRows(leads)
    );
  }

  return NextResponse.json({ data: { leads, summary }, error: null });
}
