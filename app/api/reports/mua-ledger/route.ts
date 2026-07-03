import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { scopeFromSession } from "@/lib/report-scope";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { muaNotOnPlanSql } from "@/lib/mua-active-plan";
import { toDbPlanTier } from "@/lib/db-mappers";
import { csvResponse } from "@/lib/report-utils";

const LEDGER_ENTRY_CSV_HEADERS = [
  "Date",
  "Time",
  "Source",
  "Action",
  "Lead ID",
  "Bride Name",
  "Lead Tier",
  "Region",
  "Stage",
  "Details",
  "RM",
  "Amount",
] as const;

const SUMMARY_CSV_HEADERS = [
  "MUA Name",
  "Display ID",
  "City",
  "Plan",
  "Pushes In Period",
  "Total Pushes",
  "Unique Leads",
  "Bookings",
  "Revenue In Period",
] as const;

type LedgerEntryRow = {
  createdAt: string;
  entryType: string;
  description: string;
  actorName: string | null;
  leadDisplayId: string | null;
  brideName: string | null;
  budgetTier: string | null;
  region: string | null;
  pushStage: string | null;
  bookedPrice: number | null;
};

function ledgerEntryCsvRows(entries: LedgerEntryRow[]) {
  return entries.map((e) => {
    const d = new Date(e.createdAt);
    const source = e.description.startsWith("[Sales] ") ? "Sales" : "RM";
    return [
      d.toISOString().slice(0, 10),
      d.toISOString().slice(11, 16),
      source,
      e.entryType,
      e.leadDisplayId ?? "",
      e.brideName ?? "",
      e.budgetTier ?? "",
      e.region ?? "",
      e.pushStage ?? "",
      e.description,
      e.actorName ?? "",
      e.bookedPrice ?? "",
    ];
  });
}

type SummaryRow = {
  name: string;
  displayId: string;
  city: string;
  planTier: string | null;
  pushesThisMonth: number;
  totalPushes: number;
  uniqueLeads: number;
  totalBookings: number;
  revenueThisMonth: number | null;
};

function summaryCsvRows(summary: SummaryRow[]) {
  return summary.map((m) => [
    m.name,
    m.displayId,
    m.city,
    m.planTier ?? "",
    m.pushesThisMonth,
    m.totalPushes,
    m.uniqueLeads,
    m.totalBookings,
    m.revenueThisMonth ?? 0,
  ]);
}

export async function GET(request: Request) {
  const auth = await requireRoles(["regionalRm", "commissionRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = scopeFromSession(auth.session);
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const muaId = searchParams.get("muaId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const tierRaw = searchParams.get("tier");
  const filterNonPlan = tierRaw === "none";
  const tier = filterNonPlan ? null : toDbPlanTier(tierRaw);

  const scopeRmId = scope.kind === "rm" ? scope.staffId : null;
  const scopeCommission = scope.kind === "commission";

  if (USE_MOCK) {
    const data = mockStore.getMuaLedger({
      muaId,
      tier: tierRaw,
      city: null,
      dateFrom,
      dateTo,
    });
    if (format === "csv" && muaId) {
      return csvResponse(
        `mua-ledger-${muaId}`,
        [...LEDGER_ENTRY_CSV_HEADERS],
        ledgerEntryCsvRows(data.entries as LedgerEntryRow[])
      );
    }
    if (format === "csv") {
      return csvResponse(
        "my-mua-activity",
        [...SUMMARY_CSV_HEADERS],
        summaryCsvRows(data.summary as SummaryRow[])
      );
    }
    return NextResponse.json({ data, error: null });
  }

  if (muaId) {
    const entries = await sql<LedgerEntryRow[]>`
      WITH rm_entries AS (
        SELECT
          c.created_at AS "createdAt",
          c.entry_type::text AS "entryType",
          c.description,
          s.name AS "actorName",
          bl.display_id AS "leadDisplayId",
          bl.bride_name AS "brideName",
          bl.budget_tier::text AS "budgetTier",
          bl.region::text AS region,
          mp.stage::text AS "pushStage",
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
            ${scopeRmId}::uuid IS NULL
            OR mp.pushed_by = ${scopeRmId}
            OR bl.assigned_rm_id = ${scopeRmId}
            OR c.actor_id = ${scopeRmId}
          )
          AND (
            ${scopeCommission}::boolean = false
            OR bl.status = 'commission_rm'
            OR bl.id IS NULL
          )
          AND (${dateFrom}::text IS NULL OR c.created_at::date >= ${dateFrom}::date)
          AND (${dateTo}::text IS NULL OR c.created_at::date <= ${dateTo}::date)
      ),
      sales_entries AS (
        SELECT
          scl.created_at AS "createdAt",
          scl.entry_type::text AS "entryType",
          ('[Sales] ' || scl.description) AS description,
          s.name AS "actorName",
          NULL::text AS "leadDisplayId",
          NULL::text AS "brideName",
          NULL::text AS "budgetTier",
          NULL::text AS region,
          p.stage::text AS "pushStage",
          NULL::numeric AS "bookedPrice"
        FROM sales.comms_log scl
        JOIN sales.pipeline p ON p.id = scl.pipeline_id
        LEFT JOIN staff s ON s.id = scl.actor_id
        WHERE p.mua_id = ${muaId}::uuid
          AND (${scopeRmId}::uuid IS NULL OR p.assigned_to = ${scopeRmId} OR scl.actor_id = ${scopeRmId})
          AND (${dateFrom}::text IS NULL OR scl.created_at::date >= ${dateFrom}::date)
          AND (${dateTo}::text IS NULL OR scl.created_at::date <= ${dateTo}::date)
      )
      SELECT * FROM rm_entries
      UNION ALL
      SELECT * FROM sales_entries
      ORDER BY "createdAt" DESC
      LIMIT 500
    `;

    if (format === "csv") {
      return csvResponse(
        `mua-ledger-${muaId}`,
        [...LEDGER_ENTRY_CSV_HEADERS],
        ledgerEntryCsvRows(entries)
      );
    }

    return NextResponse.json({ data: { entries }, error: null });
  }

  const summary = await sql<SummaryRow[]>`
    SELECT
      m.id,
      m.display_id AS "displayId",
      m.name,
      m.city,
      m.plan_tier::text AS "planTier",
      COUNT(mp.id) FILTER (
        WHERE (${dateFrom}::text IS NULL AND mp.created_at >= date_trunc('month', NOW()))
          OR (${dateFrom}::text IS NOT NULL AND mp.created_at::date >= ${dateFrom}::date
            AND (${dateTo}::text IS NULL OR mp.created_at::date <= ${dateTo}::date))
      )::int AS "pushesThisMonth",
      COUNT(mp.id)::int AS "totalPushes",
      COUNT(DISTINCT mp.lead_id)::int AS "uniqueLeads",
      COUNT(b.id)::int AS "totalBookings",
      SUM(b.booked_price) FILTER (
        WHERE (${dateFrom}::text IS NULL AND b.booking_date >= date_trunc('month', CURRENT_DATE))
          OR (${dateFrom}::text IS NOT NULL AND b.booking_date::date >= ${dateFrom}::date
            AND (${dateTo}::text IS NULL OR b.booking_date::date <= ${dateTo}::date))
      )::float AS "revenueThisMonth"
    FROM muas m
    LEFT JOIN mua_pushes mp ON mp.mua_id = m.id
    LEFT JOIN bride_leads bl ON bl.id = mp.lead_id
    LEFT JOIN bookings b ON b.mua_id = m.id AND b.lead_id = bl.id
      AND NOT COALESCE(b.cancelled, false)
    WHERE (
        ${tierRaw}::text IS NULL
        OR (${filterNonPlan}::boolean AND ${sql.unsafe(muaNotOnPlanSql("m"))})
        OR m.plan_tier = ${tier}::plan_tier
      )
      AND (
        ${scopeRmId}::uuid IS NULL
        OR mp.pushed_by = ${scopeRmId}
        OR bl.assigned_rm_id = ${scopeRmId}
      )
      AND (
        ${scopeCommission}::boolean = false
        OR bl.status = 'commission_rm'
        OR bl.id IS NULL
      )
    GROUP BY m.id
    HAVING COUNT(mp.id) > 0
    ORDER BY "pushesThisMonth" DESC
    LIMIT 500
  `;

  if (format === "csv") {
    return csvResponse(
      "my-mua-activity",
      [...SUMMARY_CSV_HEADERS],
      summaryCsvRows(summary)
    );
  }

  const strip = {
    totalPlanMuas: summary.filter((m) => m.planTier).length,
    activeThisMonth: summary.filter((m) => m.pushesThisMonth > 0).length,
    revenueThisMonth: summary.reduce((a, m) => a + Number(m.revenueThisMonth ?? 0), 0),
    avgPushes:
      summary.length > 0
        ? Math.round(
            (summary.reduce((a, m) => a + m.pushesThisMonth, 0) / summary.length) * 10
          ) / 10
        : 0,
  };

  return NextResponse.json({ data: { summary, strip }, error: null });
}
