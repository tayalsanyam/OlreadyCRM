import { sql } from "@/db/index";

export type RmSummaryRow = {
  rmId: string;
  rmName: string;
  region: string;
  totalLeads: number;
  notContacted: number;
  contacted: number;
  pendingConfirmation: number;
  awaitingProfiles: number;
  avgMuasOffered: number | null;
  belowAverage: number;
  booked: number;
  shifted: number;
};

export type RmSummaryLeadRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  budgetTier: string;
  status: string;
  eventDate: string;
  urgencyBand: string;
  muasOffered: number;
  muaDetails: Array<{
    muaName: string;
    stage: string;
    status: string;
    lastActivity: string;
  }>;
};

export async function fetchRmSummary(params: {
  region?: string | null;
  rmId?: string | null;
}): Promise<{ summary: RmSummaryRow[]; leads: RmSummaryLeadRow[] }> {
  const region = params.region ?? null;
  const rmId = params.rmId ?? null;

  const summary = await sql<RmSummaryRow[]>`
    SELECT
      s.id AS "rmId",
      s.name AS "rmName",
      s.region::text AS region,
      COUNT(DISTINCT bl.id)::int AS "totalLeads",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE NOT EXISTS (SELECT 1 FROM mua_pushes mp WHERE mp.lead_id = bl.id)
      )::int AS "notContacted",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE EXISTS (SELECT 1 FROM mua_pushes mp WHERE mp.lead_id = bl.id)
      )::int AS "contacted",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE bl.confirmation_status = 'pending'
      )::int AS "pendingConfirmation",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE bl.confirmation_status = 'confirmed'
          AND (
            SELECT COUNT(DISTINCT mp.mua_id)::int
            FROM mua_pushes mp
            WHERE mp.lead_id = bl.id
              AND mp.status NOT IN ('closed', 'booked')
              AND (
              bl.owner_assigned_at IS NULL
              OR mp.created_at >= bl.owner_assigned_at
            )
          ) < 4
      )::int AS "awaitingProfiles",
      ROUND(AVG(sub.mua_count), 1)::float AS "avgMuasOffered",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE COALESCE(sub.mua_count, 0) < rm_avg.avg_muas
      )::int AS "belowAverage",
      COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'booked')::int AS booked,
      COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'commission_rm')::int AS shifted
    FROM staff s
    JOIN bride_leads bl ON bl.assigned_rm_id = s.id
      AND bl.status NOT IN ('archived', 'pending_verification')
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT mua_id)::numeric AS mua_count
      FROM mua_pushes WHERE lead_id = bl.id
    ) sub ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(AVG(lc.mua_count), 0) AS avg_muas
      FROM bride_leads bl2
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT mua_id)::numeric AS mua_count
        FROM mua_pushes WHERE lead_id = bl2.id
      ) lc ON true
      WHERE bl2.assigned_rm_id = s.id
        AND bl2.status NOT IN ('archived', 'pending_verification')
    ) rm_avg ON true
    WHERE s.role = 'regional_rm' AND s.active = true
      AND (${region}::text IS NULL OR s.region = ${region}::region)
      AND (${rmId}::uuid IS NULL OR s.id = ${rmId}::uuid)
    GROUP BY s.id, s.name, s.region
    ORDER BY s.name
  `;

  const leads = rmId
    ? await sql<RmSummaryLeadRow[]>`
      SELECT
        bl.id AS "leadId",
        bl.display_id AS "displayId",
        bl.bride_name AS "brideName",
        bl.budget_tier::text AS "budgetTier",
        bl.status::text AS status,
        bl.event_date::text AS "eventDate",
        rm.compute_urgency_band(bl.event_date)::text AS "urgencyBand",
        COUNT(DISTINCT mp.mua_id)::int AS "muasOffered",
        COALESCE(
          json_agg(
            json_build_object(
              'muaName', m.name,
              'stage', mp.stage::text,
              'status', mp.status::text,
              'lastActivity', mp.updated_at
            )
          ) FILTER (WHERE m.id IS NOT NULL),
          '[]'::json
        ) AS "muaDetails"
      FROM bride_leads bl
      LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id
      LEFT JOIN muas m ON m.id = mp.mua_id
      WHERE bl.assigned_rm_id = ${rmId}::uuid
        AND bl.status NOT IN ('archived', 'pending_verification')
      GROUP BY bl.id
      ORDER BY bl.event_date ASC
    `
    : [];

  return { summary, leads };
}
