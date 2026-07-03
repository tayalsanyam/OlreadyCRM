import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { scopeFromSession } from "@/lib/report-scope";
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
  csvResponse,
  toDbStatusFilter,
  toDbTier,
} from "@/lib/report-utils";
import { LEAD_LAST_CONTACT_UNION } from "@/lib/lead-contact-sql";

export async function GET(request: Request) {
  const auth = await requireRoles(["regionalRm", "commissionRm", "feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = scopeFromSession(auth.session);

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const region = searchParams.get("region");
  const tier = toDbTier(searchParams.get("tier"));
  const eventFrom = searchParams.get("eventFrom");
  const eventTo = searchParams.get("eventTo");
  const status = toDbStatusFilter(searchParams.get("status"));
  const funnelStage = parseLeadJourneyFunnelStage(searchParams.get("funnelStage"));

  const scopeRmId = scope.kind === "rm" ? scope.staffId : null;
  const scopeCommission = scope.kind === "commission";
  const scopeFeedback = scope.kind === "feedback";

  if (USE_MOCK) {
    const rmId = scopeRmId ?? null;
    const { leads } = mockStore.getLeadJourney({
      region,
      tier,
      rmId,
      eventFrom,
      eventTo,
      status,
    });
    let enrichedMock = leads.map((l) => enrichLeadJourneyRow(l));
    const atStageCounts = buildLeadJourneyAtStageCounts(enrichedMock);
    enrichedMock = filterLeadsByFunnelStage(enrichedMock, funnelStage);
    const summary = { ...buildLeadJourneySummary(enrichedMock), atStageCounts };
    if (format === "csv") {
      return csvResponse(
        "my-lead-journey",
        ["Display ID", "Bride", "Status", "Total Days", "MUAs Offered"],
        enrichedMock.map((l) => [
          l.displayId,
          l.brideName,
          l.status,
          l.totalDaysOpen ?? "",
          l.totalMuasOffered,
        ])
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
      AND (${scopeRmId}::uuid IS NULL OR bl.assigned_rm_id = ${scopeRmId}::uuid)
      AND (${scopeCommission}::boolean = false OR bl.status = 'commission_rm')
      AND (
        ${scopeFeedback} = false
        OR (
          bl.status IN ('expired'::lead_status, 'booked'::lead_status)
          AND NOT EXISTS (
            SELECT 1 FROM lead_events le
            WHERE le.lead_id = bl.id
              AND le.status != 'not_needed'
              AND le.event_date >= CURRENT_DATE
          )
        )
      )
      AND (${eventFrom}::text IS NULL OR bl.event_date >= ${eventFrom}::date)
      AND (${eventTo}::text IS NULL OR bl.event_date <= ${eventTo}::date)
      AND (${status}::text IS NULL OR bl.status = ${status}::lead_status)
    GROUP BY bl.id, s.name, bl.requirements_confirmed_at, bl.confirmation_status, bl.lead_phase, bl.portal_only
    ORDER BY bl.created_at DESC
  `;

  let leads = rows.map((r) => enrichLeadJourneyRow(r));
  const atStageCounts = buildLeadJourneyAtStageCounts(leads);
  leads = filterLeadsByFunnelStage(leads, funnelStage);
  const summary = { ...buildLeadJourneySummary(leads), atStageCounts };

  if (format === "csv") {
    return csvResponse(
      "my-lead-journey",
      [
        "Display ID",
        "Bride",
        "Region",
        "Tier",
        "Status",
        "Days To Verify",
        "Days To Assign",
        "Days To First Push",
        "Days To Booking",
        "Total Days",
        "MUAs Offered",
      ],
      leads.map((l) => [
        l.displayId,
        l.brideName,
        l.region,
        l.budgetTier,
        l.status,
        l.daysToVerify ?? "",
        l.daysToAssign ?? "",
        l.daysToFirstPush ?? "",
        l.daysToBooking ?? "",
        l.totalDaysOpen ?? "",
        l.totalMuasOffered,
      ])
    );
  }

  return NextResponse.json({ data: { leads, summary }, error: null });
}
