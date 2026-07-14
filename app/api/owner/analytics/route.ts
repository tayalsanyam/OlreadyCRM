import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { sql } from "@/db/index";
import { queryRmPerformance } from "@/lib/rm-performance";

export async function GET() {
  const auth = await requireRoles(["owner", "admin"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({ data: mockStore.getAnalytics(), error: null });
  }

  try {
  const volumeByWeek = await sql`
    SELECT
      to_char(date_trunc('week', created_at), 'Mon DD') AS week,
      COUNT(*) FILTER (WHERE budget_tier = 'tier_1')::int AS tier1,
      COUNT(*) FILTER (WHERE budget_tier = 'tier_2')::int AS tier2,
      COUNT(*) FILTER (WHERE budget_tier = 'tier_3')::int AS tier3
    FROM bride_leads
    WHERE created_at >= NOW() - INTERVAL '8 weeks'
    GROUP BY 1
    ORDER BY 1
  `;

  const conversionByRegion = await sql`
    SELECT
      INITCAP(region::text) AS region,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'booked') /
        NULLIF(COUNT(*) FILTER (WHERE status IN ('assigned', 'booked', 'commission_rm')), 0),
        1
      )::float AS rate
    FROM bride_leads
    GROUP BY region
    ORDER BY region
  `;

  const lossAttribution = await sql`
    SELECT
      CASE
        WHEN bl.status = 'booked' THEN 'Booked'
        WHEN bl.status = 'archived' AND bl.hostile_note IS NOT NULL THEN 'Not answering'
        WHEN bl.status = 'commission_rm' AND bl.shifted_at IS NOT NULL
             AND bl.assignment_date IS NOT NULL
             AND (bl.shifted_at::date - bl.assignment_date) >=
                 (SELECT assignment_window_days FROM sla_config WHERE id = 1)
          THEN '45-day Shift'
        WHEN bl.status = 'commission_rm' THEN 'Not Interested'
        WHEN bl.status = 'archived' THEN 'Archived'
        WHEN bl.status = 'missed' THEN 'Missed'
        ELSE 'Active'
      END AS name,
      COUNT(*)::int AS value
    FROM bride_leads bl
    WHERE bl.created_at >= NOW() - INTERVAL '3 months'
    GROUP BY 1
    ORDER BY value DESC
  `;

  const muaUtilisation = await sql`
    SELECT
      m.name,
      p.name AS tier,
      COUNT(mp.id) FILTER (
        WHERE mp.created_at >= date_trunc('week', CURRENT_DATE)
      )::int AS pushes,
      p.weekly_cap AS cap
    FROM muas m
    JOIN plan_tiers p ON p.tier = m.plan_tier
    LEFT JOIN mua_pushes mp ON mp.mua_id = m.id
    WHERE m.plan_tier IS NOT NULL
    GROUP BY m.id, m.name, p.name, p.weekly_cap, p.sort_order
    ORDER BY p.sort_order
  `;

  const bookingRevenueByMonth = await sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', b.created_at), 'Mon YY') AS month,
      SUM(b.booked_price)::float AS revenue,
      COUNT(*)::int AS bookings
    FROM bookings b
    WHERE b.created_at >= NOW() - INTERVAL '6 months'
    GROUP BY 1
    ORDER BY MIN(b.created_at)
  `;

  const leadSourceBreakdown = await sql`
    SELECT
      COALESCE(NULLIF(source, ''), 'Unknown') AS source,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'booked')::int AS booked,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'booked') /
        NULLIF(COUNT(*), 0), 1
      )::float AS conversion_pct
    FROM bride_leads
    WHERE created_at >= NOW() - INTERVAL '3 months'
    GROUP BY source
    ORDER BY total DESC
    LIMIT 10
  `;

  const tierFunnel = await sql`
    SELECT
      budget_tier,
      COUNT(*) FILTER (WHERE status != 'pending_verification')::int AS verified,
      COUNT(*) FILTER (WHERE status IN ('assigned','booked','commission_rm'))::int AS assigned,
      COUNT(*) FILTER (WHERE status = 'booked')::int AS booked
    FROM bride_leads
    GROUP BY budget_tier
    ORDER BY budget_tier
  `;

  const rmRows = await queryRmPerformance(sql);
  const rmLeaderboard = rmRows.slice(0, 5).map((r) => ({
    rmName: r.rmName,
    region: r.region,
    conversionPct: r.conversionPct,
    totalBooked: r.totalBooked,
  }));

  return NextResponse.json({
    data: {
      volumeByWeek,
      conversionByRegion,
      lossAttribution,
      muaUtilisation,
      bookingRevenueByMonth,
      leadSourceBreakdown,
      tierFunnel,
      rmLeaderboard,
    },
    error: null,
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analytics query failed";
    console.error("[owner/analytics]", e);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
