import { sql } from "@/db/index";
import type { PerformancePayload, PerformanceRow } from "@/lib/admin-reports-hub-types";
import { queryRmPerformance } from "@/lib/rm-performance";
import { currentMonthKey, queryTargetVsActual } from "@/lib/targets";

export async function fetchPerformanceReport(
  month?: string | null,
  staffId?: string | null,
): Promise<PerformancePayload> {
  const monthKey = month || currentMonthKey();

  const [sla] = await sql<{ inactivityThresholdHours: number }[]>`
    SELECT inactivity_threshold_hours FROM sla_config WHERE id = 1
  `;
  const hours = sla?.inactivityThresholdHours ?? 48;

  const [allRmPerformance, allTargets, inactive] = await Promise.all([
    queryRmPerformance(sql, hours),
    queryTargetVsActual(sql, monthKey, staffId ?? undefined),
    sql<
      { id: string; brideName: string; urgencyBand: string; hoursSince: number }[]
    >`
      SELECT
        bl.id,
        bl.bride_name AS "brideName",
        rm.compute_urgency_band(bl.event_date)::text AS "urgencyBand",
        EXTRACT(EPOCH FROM (NOW() - COALESCE(
          (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id),
          bl.created_at
        ))) / 3600 AS "hoursSince"
      FROM bride_leads bl
      WHERE bl.status = 'assigned'
        AND rm.compute_urgency_band(bl.event_date) IN ('critical', 'hot')
        AND EXTRACT(EPOCH FROM (NOW() - COALESCE(
          (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id),
          bl.created_at
        ))) / 3600 > ${hours}
        AND (${staffId ?? null}::uuid IS NULL OR bl.assigned_rm_id = ${staffId ?? null}::uuid)
      ORDER BY "hoursSince" DESC
      LIMIT 25
    `,
  ]);

  const rmPerformance = staffId
    ? allRmPerformance.filter((r) => r.rmId === staffId)
    : allRmPerformance;
  const targets = allTargets;

  const targetByStaff = new Map(targets.map((t) => [t.staffId, t]));

  const rows: PerformanceRow[] = rmPerformance.map((r) => {
    const t = targetByStaff.get(r.rmId);
    return {
      staffId: r.rmId,
      staffName: r.rmName,
      role: r.role,
      region: r.region,
      totalActive: r.totalActive,
      totalBooked: r.totalBooked,
      totalShifted: r.totalShifted,
      conversionPct: r.conversionPct,
      avgPushesPerLead: r.avgPushesPerLead,
      staleLeads: r.staleLeads,
      pendingConfirmation: r.pendingConfirmation,
      awaitingProfiles: r.awaitingProfiles,
      overdueIntakeTasks: r.overdueIntakeTasks,
      targets: t
        ? {
            targetBookings: t.targetBookings,
            targetLeadsWorked: t.targetLeadsWorked,
            targetAvgMuasPerLead: t.targetAvgMuasPerLead,
            targetCommission: t.targetCommission,
            actualBookings: t.actualBookings,
            actualLeadsWorked: t.actualLeadsWorked,
            actualAvgMuasPerLead: t.actualAvgMuasPerLead,
            actualCommissionCollected: t.actualCommissionCollected,
            monthConversionPct: t.conversionPct,
          }
        : null,
    };
  });

  const targetsSet = targets.filter(
    (t) =>
      t.targetBookings != null ||
      t.targetLeadsWorked != null ||
      t.targetAvgMuasPerLead != null ||
      t.targetCommission != null
  ).length;

  let bookingsOnTrack = 0;
  let bookingsBehind = 0;
  for (const t of targets) {
    if (t.targetBookings == null) continue;
    if (t.actualBookings >= t.targetBookings) bookingsOnTrack += 1;
    else bookingsBehind += 1;
  }

  const best = rmPerformance.reduce<{ name: string; pct: number } | null>((acc, r) => {
    if (r.conversionPct == null) return acc;
    if (!acc || r.conversionPct > acc.pct) {
      return { name: r.rmName, pct: r.conversionPct };
    }
    return acc;
  }, null);

  return {
    month: monthKey,
    staleThresholdHours: hours,
    summary: {
      staffCount: rows.length,
      totalStale: rows.reduce((s, r) => s + r.staleLeads, 0),
      totalOverdueIntake: rows.reduce((s, r) => s + r.overdueIntakeTasks, 0),
      targetsSet,
      bookingsOnTrack,
      bookingsBehind,
      bestConversion: best,
    },
    inactiveCriticalHot: inactive.map((r) => ({
      id: r.id,
      brideName: r.brideName,
      urgencyBand: r.urgencyBand,
      hoursSince: Math.round(Number(r.hoursSince)),
    })),
    rows,
  };
}
