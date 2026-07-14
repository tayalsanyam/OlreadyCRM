import { sql } from "@/db/index";
import { LEAD_LAST_CONTACT_UNION } from "@/lib/lead-contact-sql";
import {
  parseRmOverviewRoleFilter,
  parseRmOverviewStatusFilters,
  type RmOverviewRoleFilter,
  type RmOverviewStatusFilter,
} from "@/lib/rm-lead-overview-filters";
import {
  enrichLeadJourneyRow,
  leadJourneyFunnelStageDisplay,
  type RawLeadJourneyRow,
} from "@/lib/reports/lead-journey-shared";
import { toDbTier } from "@/lib/report-utils";

export type RmLeadOverviewRow = {
  id: string;
  displayId: string;
  brideName: string;
  region: string | null;
  budgetTier: string;
  status: string;
  leadPhase: string | null;
  eventDate: string | null;
  rmId: string | null;
  rmName: string | null;
  rmRole: string | null;
  funnelStage: string;
  latestPushStage: string | null;
  pushCount: number;
  bookingCount: number;
  lastActivityType: string | null;
  lastActivitySummary: string | null;
  lastActivityAt: string | null;
  lastContactAt: string | null;
};

export async function fetchRmLeadOverviewRows(opts: {
  rmId?: string | null;
  rmRole?: RmOverviewRoleFilter | string | null;
  region?: string | null;
  tier?: string | null;
  statuses?: RmOverviewStatusFilter[] | string | null;
  eventFrom?: string | null;
  eventTo?: string | null;
  search?: string | null;
  assignedOnly?: boolean;
}): Promise<RmLeadOverviewRow[]> {
  const rmId = opts.rmId ?? null;
  const rmRole = parseRmOverviewRoleFilter(
    typeof opts.rmRole === "string" ? opts.rmRole : opts.rmRole ?? null
  );
  const region = opts.region ?? null;
  const tier = opts.tier ? toDbTier(opts.tier) : null;
  const statuses =
    typeof opts.statuses === "string"
      ? parseRmOverviewStatusFilters(opts.statuses)
      : (opts.statuses ?? []);
  const eventFrom = opts.eventFrom ?? null;
  const eventTo = opts.eventTo ?? null;
  const search = opts.search?.trim() || null;
  const assignedOnly = opts.assignedOnly ?? true;
  const rmRoleParam = rmRole === "all" ? null : rmRole;
  const noStatusFilter = statuses.length === 0;
  const statusAssigned = statuses.includes("assigned");
  const statusBooked = statuses.includes("booked");
  const statusVerified = statuses.includes("verified");
  const statusCommission = statuses.includes("commission_rm");
  const statusExpired = statuses.includes("expired");
  const statusClosed = statuses.includes("closed");
  const statusPending = statuses.includes("pending_verification");
  const statusArchived = statuses.includes("archived");

  const rows = await sql<
    (RawLeadJourneyRow & {
      rmId: string | null;
      rmRole: string | null;
      latestPushStage: string | null;
      lastActivityType: string | null;
      lastActivitySummary: string | null;
      lastActivityAt: string | null;
    })[]
  >`
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
      s.id AS "rmId",
      s.role::text AS "rmRole",
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
        WHERE b.lead_id = bl.id AND NOT COALESCE(b.cancelled, false)) AS "bookingsCount",
      (
        SELECT mp3.stage::text
        FROM mua_pushes mp3
        WHERE mp3.lead_id = bl.id
        ORDER BY mp3.updated_at DESC NULLS LAST, mp3.created_at DESC
        LIMIT 1
      ) AS "latestPushStage",
      (
        SELECT c.entry_type::text
        FROM comms c
        WHERE c.lead_id = bl.id
        ORDER BY c.created_at DESC
        LIMIT 1
      ) AS "lastActivityType",
      (
        SELECT LEFT(c.description, 160)
        FROM comms c
        WHERE c.lead_id = bl.id
        ORDER BY c.created_at DESC
        LIMIT 1
      ) AS "lastActivitySummary",
      (
        SELECT MAX(c.created_at)
        FROM comms c
        WHERE c.lead_id = bl.id
      ) AS "lastActivityAt"
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id
    WHERE (${assignedOnly}::boolean = false OR bl.assigned_rm_id IS NOT NULL)
      AND (${rmId}::uuid IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
      AND (${rmRoleParam}::text IS NULL OR s.role = ${rmRoleParam}::user_role)
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${tier}::text IS NULL OR bl.budget_tier = ${tier}::budget_tier)
      AND (${eventFrom}::text IS NULL OR bl.event_date >= ${eventFrom}::date)
      AND (${eventTo}::text IS NULL OR bl.event_date <= ${eventTo}::date)
      AND (
        ${noStatusFilter}::boolean
        OR (${statusAssigned}::boolean AND bl.status = 'assigned'::lead_status)
        OR (${statusBooked}::boolean AND bl.status = 'booked'::lead_status)
        OR (${statusVerified}::boolean AND bl.status = 'verified'::lead_status)
        OR (${statusCommission}::boolean AND bl.status = 'commission_rm'::lead_status)
        OR (${statusExpired}::boolean AND bl.lead_phase = 'expired')
        OR (${statusClosed}::boolean AND bl.lead_phase = 'closed')
        OR (${statusPending}::boolean AND bl.status = 'pending_verification'::lead_status)
        OR (${statusArchived}::boolean AND bl.status = 'archived'::lead_status)
      )
      AND (
        ${search}::text IS NULL
        OR bl.bride_name ILIKE ${search ? `%${search}%` : null}
        OR bl.display_id ILIKE ${search ? `%${search}%` : null}
      )
    GROUP BY bl.id, s.id, s.name, s.role, bl.requirements_confirmed_at, bl.confirmation_status, bl.lead_phase, bl.portal_only
    ORDER BY COALESCE(
      (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id),
      bl.created_at
    ) DESC NULLS LAST
    LIMIT 1000
  `;

  return rows.map((row) => {
    const enriched = enrichLeadJourneyRow(row);
    return {
      id: row.id,
      displayId: row.displayId,
      brideName: row.brideName,
      region: row.region,
      budgetTier: row.budgetTier,
      status: row.status,
      leadPhase: row.leadPhase,
      eventDate: row.eventDate,
      rmId: row.rmId,
      rmName: row.rmName,
      rmRole: row.rmRole,
      funnelStage: leadJourneyFunnelStageDisplay(enriched),
      latestPushStage: row.latestPushStage,
      pushCount: row.totalPushes,
      bookingCount: row.bookingsCount,
      lastActivityType: row.lastActivityType,
      lastActivitySummary: row.lastActivitySummary,
      lastActivityAt: row.lastActivityAt,
      lastContactAt: row.lastContactAt,
    };
  });
}
