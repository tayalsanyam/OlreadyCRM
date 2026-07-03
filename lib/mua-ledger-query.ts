import { sql } from "@/db/index";
import { muaNotOnPlanSql } from "@/lib/mua-active-plan";
import { toDbPlanTier } from "@/lib/db-mappers";
import { MUA_PLAN_RM_NAME_SQL } from "@/lib/mua-contact-sql";

export type MuaLedgerEntrySource = "rm" | "sales" | "call" | "care" | "plan";

export type MuaLedgerEntry = {
  id: string;
  createdAt: string;
  entryType: string;
  source: MuaLedgerEntrySource;
  description: string;
  actorName: string | null;
  leadDisplayId: string | null;
  brideName: string | null;
  budgetTier: string | null;
  region: string | null;
  pushStage: string | null;
  pushStatus: string | null;
  bookedPrice: number | null;
};

export type MuaLedgerSummaryRow = {
  id: string;
  displayId: string;
  name: string;
  city: string;
  regionalRmName: string | null;
  planRmName: string | null;
  planTier: string | null;
  planExpiry: string | null;
  weeklyCap: number | null;
  monthlyPushTarget: number | null;
  assuredBookings: number | null;
  pushesThisMonth: number;
  totalPushes: number;
  uniqueLeads: number;
  totalBookings: number;
  totalRevenue: number | null;
  revenueThisMonth: number | null;
  lastActivity: string | null;
};

export async function fetchMuaLedgerEntries(opts: {
  muaId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  allTime?: boolean;
  limit?: number;
}): Promise<MuaLedgerEntry[]> {
  const { muaId } = opts;
  const dateFrom = opts.dateFrom ?? null;
  const dateTo = opts.dateTo ?? null;
  const allTime = opts.allTime ?? false;
  const limit = opts.limit ?? 2000;

  return sql<MuaLedgerEntry[]>`
    WITH rm_entries AS (
      SELECT
        c.id::text AS id,
        c.created_at AS "createdAt",
        CASE
          WHEN c.metadata->>'action' = 'booking_cancelled'
            OR c.description ILIKE 'Booking cancelled:%'
          THEN 'booking_cancelled'
          ELSE c.entry_type::text
        END AS "entryType",
        'rm'::text AS source,
        c.description,
        s.name AS "actorName",
        bl.display_id AS "leadDisplayId",
        bl.bride_name AS "brideName",
        bl.budget_tier::text AS "budgetTier",
        bl.region::text AS region,
        mp.stage::text AS "pushStage",
        mp.status::text AS "pushStatus",
        b.booked_price AS "bookedPrice"
      FROM comms c
      LEFT JOIN staff s ON s.id = c.actor_id
      LEFT JOIN bride_leads bl ON bl.id = c.lead_id
      LEFT JOIN mua_pushes mp ON mp.id = (c.metadata->>'pushId')::uuid
      LEFT JOIN bookings b ON b.push_id = mp.id AND NOT COALESCE(b.cancelled, false)
      WHERE (
          c.mua_id = ${muaId}::uuid
          OR (c.entry_type = 'mua_pushed' AND c.metadata->>'muaId' = ${muaId})
          OR (
            c.entry_type = 'booking_confirmed'
            AND EXISTS (
              SELECT 1 FROM bookings bk
              WHERE bk.mua_id = ${muaId}::uuid AND bk.lead_id = c.lead_id
                AND NOT COALESCE(bk.cancelled, false)
            )
          )
        )
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR c.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR c.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    sales_entries AS (
      SELECT
        scl.id::text AS id,
        scl.created_at AS "createdAt",
        scl.entry_type::text AS "entryType",
        'sales'::text AS source,
        ('[Sales] ' || scl.description) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        p.stage::text AS "pushStage",
        p.status::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM sales.comms_log scl
      JOIN sales.pipeline p ON p.id = scl.pipeline_id
      LEFT JOIN staff s ON s.id = scl.actor_id
      WHERE p.mua_id = ${muaId}::uuid
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR scl.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR scl.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    call_entries AS (
      SELECT
        cl.id::text AS id,
        cl.called_at AS "createdAt",
        'call_logged'::text AS "entryType",
        'call'::text AS source,
        COALESCE(
          NULLIF(TRIM('Call' || CASE WHEN cl.outcome IS NOT NULL THEN ' · ' || cl.outcome ELSE '' END), ''),
          'Call logged'
        ) AS description,
        s.name AS "actorName",
        bl.display_id AS "leadDisplayId",
        bl.bride_name AS "brideName",
        bl.budget_tier::text AS "budgetTier",
        bl.region::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM call_logs cl
      LEFT JOIN staff s ON s.id = cl.staff_id
      LEFT JOIN bride_leads bl ON bl.id = cl.lead_id
      WHERE cl.mua_id = ${muaId}::uuid
        AND cl.called_at IS NOT NULL
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR cl.called_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR cl.called_at::date <= ${dateTo}::date)
          )
        )
      UNION ALL
      SELECT
        ('sales-call-' || scl2.id::text) AS id,
        scl2.called_at AS "createdAt",
        'call_logged'::text AS "entryType",
        'call'::text AS source,
        COALESCE(
          NULLIF(TRIM('Sales call' || CASE WHEN scl2.outcome IS NOT NULL THEN ' · ' || scl2.outcome ELSE '' END), ''),
          'Sales call logged'
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM sales.call_logs scl2
      JOIN sales.pipeline p ON p.id = scl2.pipeline_id
      LEFT JOIN staff s ON s.id = scl2.salesperson_id
      WHERE p.mua_id = ${muaId}::uuid
        AND scl2.called_at IS NOT NULL
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR scl2.called_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR scl2.called_at::date <= ${dateTo}::date)
          )
        )
    ),
    plan_entries AS (
      SELECT
        ('plan-' || mph.id::text) AS id,
        mph.assigned_at AS "createdAt",
        'plan_assigned'::text AS "entryType",
        'plan'::text AS source,
        TRIM(
          'Plan '
          || COALESCE(REPLACE(mph.plan_tier::text, '_', ' '), 'removed')
          || CASE WHEN mph.expiry_at IS NOT NULL THEN ' · expires ' || mph.expiry_at::text ELSE '' END
          || CASE WHEN mph.notes IS NOT NULL AND TRIM(mph.notes) != '' THEN ' · ' || mph.notes ELSE '' END
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM mua_plan_history mph
      LEFT JOIN staff s ON s.id = mph.assigned_by
      WHERE mph.mua_id = ${muaId}::uuid
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR mph.assigned_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR mph.assigned_at::date <= ${dateTo}::date)
          )
        )
    ),
    care_comment_entries AS (
      SELECT
        ('care-comment-' || c.id::text) AS id,
        c.created_at AS "createdAt",
        CASE
          WHEN c.is_ai_generated THEN 'ai_advisor'
          WHEN c.is_internal THEN 'ticket_internal'
          ELSE 'ticket_comment'
        END AS "entryType",
        'care'::text AS source,
        ('[' || t.ticket_number || '] '
          || CASE WHEN c.is_ai_generated THEN 'AI: ' WHEN c.is_internal THEN 'Internal: ' ELSE '' END
          || LEFT(c.body, 500)
          || CASE WHEN LENGTH(c.body) > 500 THEN '…' ELSE '' END
        ) AS description,
        COALESCE(s.name, CASE WHEN c.is_ai_generated THEN 'AI Advisor' ELSE NULL END) AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM support.ticket_comments c
      JOIN support.tickets t ON t.id = c.ticket_id
      LEFT JOIN staff s ON s.id = c.author_id
      WHERE t.mua_id = ${muaId}::uuid
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR c.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR c.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    care_status_entries AS (
      SELECT
        ('care-status-' || h.id::text) AS id,
        h.created_at AS "createdAt",
        'ticket_status'::text AS "entryType",
        'care'::text AS source,
        ('[' || t.ticket_number || '] Status: '
          || COALESCE(REPLACE(h.from_status::text, '_', ' '), 'new')
          || ' → '
          || REPLACE(h.to_status::text, '_', ' ')
          || CASE WHEN h.reason IS NOT NULL AND TRIM(h.reason) != '' THEN ' (' || h.reason || ')' ELSE '' END
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM support.ticket_status_history h
      JOIN support.tickets t ON t.id = h.ticket_id
      LEFT JOIN staff s ON s.id = h.changed_by
      WHERE t.mua_id = ${muaId}::uuid
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR h.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR h.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    care_email_entries AS (
      SELECT
        ('care-email-' || er.id::text) AS id,
        er.created_at AS "createdAt",
        'care_email'::text AS "entryType",
        'care'::text AS source,
        ('[' || t.ticket_number || '] Email (' || er.status::text || '): ' || er.subject) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM support.ticket_email_responses er
      JOIN support.tickets t ON t.id = er.ticket_id
      LEFT JOIN staff s ON s.id = er.sent_by
      WHERE t.mua_id = ${muaId}::uuid
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR er.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR er.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    care_escalation_entries AS (
      SELECT
        ('care-escalation-' || e.id::text) AS id,
        e.created_at AS "createdAt",
        'ticket_escalation'::text AS "entryType",
        'care'::text AS source,
        ('[' || t.ticket_number || '] Escalated to L' || e.to_level::text
          || CASE WHEN e.reason IS NOT NULL AND TRIM(e.reason) != '' THEN ': ' || e.reason ELSE '' END
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM support.ticket_escalations e
      JOIN support.tickets t ON t.id = e.ticket_id
      LEFT JOIN staff s ON s.id = e.escalated_by
      WHERE t.mua_id = ${muaId}::uuid
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR e.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR e.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    mua_created_entries AS (
      SELECT
        ('audit-create-' || al.id::text) AS id,
        al.created_at AS "createdAt",
        'mua_created'::text AS "entryType",
        'plan'::text AS source,
        TRIM(
          'MUA profile created'
          || CASE
            WHEN al.changes->'after'->>'display_id' IS NOT NULL
            THEN ' · ' || (al.changes->'after'->>'display_id')
            ELSE ''
          END
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM audit_log al
      LEFT JOIN staff s ON s.id = al.actor_id
      WHERE al.table_name = 'rm.muas'
        AND al.record_id = ${muaId}::uuid
        AND al.action = 'insert'
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR al.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR al.created_at::date <= ${dateTo}::date)
          )
        )
    ),
    mua_activated_entries AS (
      SELECT
        ('activated-' || al.id::text) AS id,
        al.activated_at AS "createdAt",
        'mua_activated'::text AS "entryType",
        'sales'::text AS source,
        COALESCE(
          NULLIF(TRIM('MUA activated on plan'), ''),
          'MUA activated on plan'
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM sales.activation_log al
      JOIN sales.pipeline p ON p.id = al.pipeline_id
      LEFT JOIN staff s ON s.id = al.activated_by
      WHERE p.mua_id = ${muaId}::uuid
        AND al.activated_at IS NOT NULL
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR al.activated_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR al.activated_at::date <= ${dateTo}::date)
          )
        )
    ),
    rm_assignment_entries AS (
      SELECT
        ('audit-rm-' || al.id::text) AS id,
        al.created_at AS "createdAt",
        'rm_assigned'::text AS "entryType",
        'plan'::text AS source,
        TRIM(
          CASE
            WHEN al.changes ? 'assigned_rm_id' THEN 'Regional RM → '
            WHEN al.changes ? 'plan_rm_id' THEN 'Plan RM → '
            ELSE 'RM assignment → '
          END
          || COALESCE(
            CASE
              WHEN al.changes ? 'assigned_rm_id' THEN (
                SELECT st.name FROM staff st
                WHERE st.id = NULLIF(al.changes->'assigned_rm_id'->>'new', '')::uuid
              )
              WHEN al.changes ? 'plan_rm_id' THEN (
                SELECT st.name FROM staff st
                WHERE st.id = NULLIF(al.changes->'plan_rm_id'->>'new', '')::uuid
                  AND st.role = 'regional_rm'::user_role
              )
            END,
            'unassigned'
          )
        ) AS description,
        s.name AS "actorName",
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        NULL::text AS "budgetTier",
        NULL::text AS region,
        NULL::text AS "pushStage",
        NULL::text AS "pushStatus",
        NULL::numeric AS "bookedPrice"
      FROM audit_log al
      LEFT JOIN staff s ON s.id = al.actor_id
      WHERE al.table_name = 'rm.muas'
        AND al.record_id = ${muaId}::uuid
        AND al.action = 'update'
        AND (al.changes ? 'assigned_rm_id' OR al.changes ? 'plan_rm_id')
        AND (
          ${allTime}::boolean
          OR (
            (${dateFrom}::text IS NULL OR al.created_at::date >= ${dateFrom}::date)
            AND (${dateTo}::text IS NULL OR al.created_at::date <= ${dateTo}::date)
          )
        )
    )
    SELECT * FROM rm_entries
    UNION ALL
    SELECT * FROM sales_entries
    UNION ALL
    SELECT * FROM call_entries
    UNION ALL
    SELECT * FROM plan_entries
    UNION ALL
    SELECT * FROM mua_created_entries
    UNION ALL
    SELECT * FROM mua_activated_entries
    UNION ALL
    SELECT * FROM rm_assignment_entries
    UNION ALL
    SELECT * FROM care_comment_entries
    UNION ALL
    SELECT * FROM care_status_entries
    UNION ALL
    SELECT * FROM care_email_entries
    UNION ALL
    SELECT * FROM care_escalation_entries
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
}

export async function fetchMuaLedgerSummary(opts: {
  dateFrom?: string | null;
  dateTo?: string | null;
  tierRaw?: string | null;
  city?: string | null;
  search?: string | null;
  regionalRmId?: string | null;
  planRmId?: string | null;
}): Promise<MuaLedgerSummaryRow[]> {
  const dateFrom = opts.dateFrom ?? null;
  const dateTo = opts.dateTo ?? null;
  const tierRaw = opts.tierRaw ?? null;
  const filterNonPlan = tierRaw === "none";
  const tier = filterNonPlan ? null : toDbPlanTier(tierRaw);
  const city = opts.city ?? null;
  const search = opts.search ?? null;
  const regionalRmId = opts.regionalRmId ?? null;
  const planRmId = opts.planRmId ?? null;

  return sql<MuaLedgerSummaryRow[]>`
    SELECT
      m.id,
      m.display_id AS "displayId",
      m.name,
      m.city,
      rrm.name AS "regionalRmName",
      ${sql.unsafe(MUA_PLAN_RM_NAME_SQL)} AS "planRmName",
      m.plan_tier::text AS "planTier",
      m.plan_expiry::text AS "planExpiry",
      pt.weekly_cap AS "weeklyCap",
      pt.monthly_push_target AS "monthlyPushTarget",
      pt.assured_bookings AS "assuredBookings",
      (
        SELECT COUNT(*)::int
        FROM mua_pushes mp
        WHERE mp.mua_id = m.id
          AND (
            (${dateFrom}::text IS NULL AND mp.created_at >= date_trunc('month', NOW()))
            OR (
              ${dateFrom}::text IS NOT NULL
              AND mp.created_at::date >= ${dateFrom}::date
              AND (${dateTo}::text IS NULL OR mp.created_at::date <= ${dateTo}::date)
            )
          )
      ) AS "pushesThisMonth",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id
      ) AS "totalPushes",
      (
        SELECT COUNT(DISTINCT mp.lead_id)::int FROM mua_pushes mp WHERE mp.mua_id = m.id
      ) AS "uniqueLeads",
      (
        SELECT COUNT(*)::int
        FROM bookings b
        WHERE b.mua_id = m.id AND NOT COALESCE(b.cancelled, false)
      ) AS "totalBookings",
      (
        SELECT COALESCE(SUM(b.booked_price), 0)::float
        FROM bookings b
        WHERE b.mua_id = m.id AND NOT COALESCE(b.cancelled, false)
      ) AS "totalRevenue",
      (
        SELECT COALESCE(SUM(b.booked_price), 0)::float
        FROM bookings b
        WHERE b.mua_id = m.id
          AND NOT COALESCE(b.cancelled, false)
          AND (
            (${dateFrom}::text IS NULL AND b.booking_date >= date_trunc('month', CURRENT_DATE))
            OR (
              ${dateFrom}::text IS NOT NULL
              AND b.booking_date::date >= ${dateFrom}::date
              AND (${dateTo}::text IS NULL OR b.booking_date::date <= ${dateTo}::date)
            )
          )
      ) AS "revenueThisMonth",
      GREATEST(
        (SELECT MAX(mp.created_at) FROM mua_pushes mp WHERE mp.mua_id = m.id),
        (SELECT MAX(c.created_at) FROM comms c WHERE c.mua_id = m.id),
        (SELECT MAX(cl.called_at) FROM call_logs cl WHERE cl.mua_id = m.id),
        (
          SELECT MAX(scl.called_at)
          FROM sales.call_logs scl
          JOIN sales.pipeline p ON p.id = scl.pipeline_id
          WHERE p.mua_id = m.id
        ),
        (SELECT MAX(mph.assigned_at) FROM mua_plan_history mph WHERE mph.mua_id = m.id),
        (
          SELECT MAX(ev.at)
          FROM (
            SELECT c.created_at AS at
            FROM support.ticket_comments c
            JOIN support.tickets t ON t.id = c.ticket_id
            WHERE t.mua_id = m.id
            UNION ALL
            SELECT h.created_at FROM support.ticket_status_history h
            JOIN support.tickets t ON t.id = h.ticket_id
            WHERE t.mua_id = m.id
            UNION ALL
            SELECT er.created_at FROM support.ticket_email_responses er
            JOIN support.tickets t ON t.id = er.ticket_id
            WHERE t.mua_id = m.id
          ) ev
        )
      ) AS "lastActivity"
    FROM muas m
    LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
    LEFT JOIN staff rrm ON rrm.id = m.assigned_rm_id
    WHERE (
        ${tierRaw}::text IS NULL
        OR (${filterNonPlan}::boolean AND ${sql.unsafe(muaNotOnPlanSql("m"))})
        OR m.plan_tier = ${tier}::plan_tier
      )
      AND (${city}::text IS NULL OR m.city ILIKE ${city ? `%${city}%` : null})
      AND (${search}::text IS NULL OR m.name ILIKE ${search ? `%${search}%` : null} OR m.display_id ILIKE ${search ? `%${search}%` : null})
      AND (${regionalRmId}::uuid IS NULL OR m.assigned_rm_id = ${regionalRmId}::uuid)
      AND (${planRmId}::uuid IS NULL OR m.plan_rm_id = ${planRmId}::uuid)
    ORDER BY "lastActivity" DESC NULLS LAST
  `;
}
