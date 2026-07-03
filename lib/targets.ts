import type postgres from "postgres";
import { activeBookingSql, rmStaffBookingCreditSql, rmStaffCommissionCreditSql } from "@/lib/active-bookings";

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) throw new Error("Invalid month");
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export type BackendStaffRole = "regional_rm" | "commission_rm";

export type TargetRow = {
  staffId: string;
  staffName: string;
  role: BackendStaffRole;
  region: string | null;
  targetBookings: number | null;
  targetLeadsWorked: number | null;
  targetAvgMuasPerLead: number | null;
  targetCommission: number | null;
  notes: string | null;
  actualBookings: number;
  actualPushCount: number;
  actualLeadsWorked: number;
  actualAvgMuasPerLead: number;
  actualCommissionCollected: number;
  conversionPct: number;
};

export async function queryTargetVsActual(
  sql: postgres.Sql,
  month: string,
  staffId?: string,
  roleFilter?: BackendStaffRole | null,
): Promise<TargetRow[]> {
  const { start, end } = monthBounds(month);

  const rows = await sql<
    {
      staffId: string;
      staffName: string;
      role: string;
      region: string | null;
      targetBookings: number | null;
      targetLeadsWorked: number | null;
      targetAvgMuasPerLead: string | null;
      targetCommission: string | null;
      notes: string | null;
      actualBookings: number;
      actualPushCount: number;
      actualLeadsWorked: number;
      actualAvgMuasPerLead: string | null;
      actualCommissionCollected: string | null;
    }[]
  >`
    SELECT
      s.id AS "staffId",
      s.name AS "staffName",
      s.role::text AS role,
      s.region::text AS region,
      t.target_bookings AS "targetBookings",
      t.target_leads_worked AS "targetLeadsWorked",
      t.target_avg_muas_per_lead::text AS "targetAvgMuasPerLead",
      t.target_commission::text AS "targetCommission",
      t.notes,
      (
        SELECT COUNT(*)::int FROM bookings b
        JOIN bride_leads bl ON bl.id = b.lead_id
        WHERE ${sql.unsafe(rmStaffBookingCreditSql())}
          AND ${sql.unsafe(activeBookingSql("b"))}
          AND b.booking_date >= ${start}::date
          AND b.booking_date <= ${end}::date
      ) AS "actualBookings",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.pushed_by = s.id
          AND mp.created_at >= ${start}::timestamptz
          AND mp.created_at < (${end}::date + INTERVAL '1 day')
      ) AS "actualPushCount",
      (
        SELECT COUNT(DISTINCT mp.lead_id)::int FROM mua_pushes mp
        WHERE mp.pushed_by = s.id
          AND mp.created_at >= ${start}::timestamptz
          AND mp.created_at < (${end}::date + INTERVAL '1 day')
      ) AS "actualLeadsWorked",
      (
        SELECT ROUND(COALESCE(AVG(sub.cnt), 0), 1)::text
        FROM (
          SELECT COUNT(DISTINCT mp2.mua_id)::numeric AS cnt
          FROM mua_pushes mp2
          WHERE mp2.pushed_by = s.id
            AND mp2.created_at >= ${start}::timestamptz
            AND mp2.created_at < (${end}::date + INTERVAL '1 day')
          GROUP BY mp2.lead_id
        ) sub
      ) AS "actualAvgMuasPerLead",
      (
        SELECT COALESCE(SUM(b.commission_paid), 0)::text
        FROM bookings b
        WHERE s.role = 'commission_rm'::user_role
          AND ${sql.unsafe(rmStaffCommissionCreditSql())}
          AND ${sql.unsafe(activeBookingSql("b"))}
          AND COALESCE(b.commission_paid_at::date, b.booking_date) >= ${start}::date
          AND COALESCE(b.commission_paid_at::date, b.booking_date) <= ${end}::date
      ) AS "actualCommissionCollected"
    FROM staff s
    LEFT JOIN rm_targets t ON t.staff_id = s.id AND t.period_start = ${start}::date
    WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND s.active = true
      AND (${staffId ?? null}::uuid IS NULL OR s.id = ${staffId ?? null}::uuid)
      AND (${roleFilter ?? null}::text IS NULL OR s.role = ${roleFilter ?? null}::user_role)
    ORDER BY
      CASE s.role WHEN 'regional_rm' THEN 0 ELSE 1 END,
      s.region NULLS LAST,
      s.name
  `;

  return rows.map((r) => {
    const actualLeadsWorked = r.actualLeadsWorked;
    const conversionPct =
      actualLeadsWorked > 0
        ? Math.round((r.actualBookings / actualLeadsWorked) * 1000) / 10
        : 0;
    return {
      staffId: r.staffId,
      staffName: r.staffName,
      role: r.role as BackendStaffRole,
      region: r.region,
      targetBookings: r.targetBookings,
      targetLeadsWorked: r.targetLeadsWorked,
      targetAvgMuasPerLead: r.targetAvgMuasPerLead
        ? parseFloat(r.targetAvgMuasPerLead)
        : null,
      targetCommission: r.targetCommission ? parseFloat(r.targetCommission) : null,
      notes: r.notes,
      actualBookings: r.actualBookings,
      actualPushCount: r.actualPushCount,
      actualLeadsWorked,
      actualAvgMuasPerLead: parseFloat(r.actualAvgMuasPerLead ?? "0") || 0,
      actualCommissionCollected: parseFloat(r.actualCommissionCollected ?? "0") || 0,
      conversionPct,
    };
  });
}
