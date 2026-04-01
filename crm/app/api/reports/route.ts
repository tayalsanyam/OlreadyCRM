import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeads, getSellingPrice, getBalance } from "@/lib/leads";
import { getBDMTargets } from "@/lib/config";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const datePreset = searchParams.get("datePreset");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const bdmParam = searchParams.get("bdm");
  const planParam = searchParams.get("plan");

  const hasPeriod = !!(dateFrom || dateTo || datePreset);
  const baseFilters: { bdm?: string; teamBdms?: string[]; plan?: string; datePreset?: string; dateFrom?: string; dateTo?: string } = {};
  if (session.user.role === "bdm" && session.user.assigned_bdm)
    baseFilters.bdm = session.user.assigned_bdm;
  if (session.user.role === "team_leader" && session.user.team_id)
    baseFilters.teamBdms = await getBdmsForTeam(session.user.team_id);
  if (bdmParam) baseFilters.bdm = bdmParam;
  if (planParam) baseFilters.plan = planParam;
  if (datePreset) baseFilters.datePreset = datePreset;
  if (dateFrom) baseFilters.dateFrom = dateFrom;
  if (dateTo) baseFilters.dateTo = dateTo;

  const dayBefore = (s: string) => {
    const d = new Date(s);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const getPresetRange = (preset: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), day = now.getDay();
    if (preset === "mtd") return { from: `${y}-${pad(m + 1)}-01`, to: fmt(now) };
    if (preset === "pm") return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    if (preset === "wtd") {
      const mon = day === 0 ? -6 : 1 - day;
      const monDate = new Date(now);
      monDate.setDate(d + mon);
      return { from: fmt(monDate), to: fmt(now) };
    }
    if (preset === "pw") {
      const mon = day === 0 ? -6 : 1 - day;
      const prevMon = new Date(now);
      prevMon.setDate(d + mon - 7);
      const prevSun = new Date(prevMon);
      prevSun.setDate(prevMon.getDate() + 6);
      return { from: fmt(prevMon), to: fmt(prevSun) };
    }
    return null;
  };
  const periodStart = dateFrom || (datePreset ? getPresetRange(datePreset)?.from : null);

  const leadFilters = hasPeriod ? { ...baseFilters, dateField: "created_at" as const } : baseFilters;
  const revenueFilters = hasPeriod ? { ...baseFilters, dateField: "last_modified" as const } : baseFilters;
  const untouchedFilters = { ...baseFilters, status: "UNTOUCHED" as const };
  const previousFilters =
    hasPeriod && periodStart
      ? { ...baseFilters, dateField: "created_at" as const, dateTo: dayBefore(periodStart) }
      : null;

  const [periodLeads, revenueLeads, untouchedLeads, previousLeads, targets] = await Promise.all([
    getLeads(leadFilters),
    hasPeriod ? getLeads(revenueFilters) : Promise.resolve([]),
    hasPeriod ? getLeads(untouchedFilters) : Promise.resolve([]),
    previousFilters ? getLeads(previousFilters) : Promise.resolve([]),
    getBDMTargets(),
  ]);

  const leads = hasPeriod
    ? [...untouchedLeads, ...periodLeads.filter((l) => l.status !== "UNTOUCHED")]
    : periodLeads;

  const byStatus: Record<string, number> = {};
  leads.forEach((l) => {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  });

  const confirmedAndPaid = leads.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
  const previousConfirmedPaid = (previousLeads || []).filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
  const paidForRevenue = hasPeriod ? revenueLeads.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status)) : confirmedAndPaid;
  const revenue = paidForRevenue.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
  const pending = confirmedAndPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
  const pendingFromPrevious = previousConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
  const totalLeads = leads.length;
  const paidCount = leads.filter((l) => l.status === "PAID").length;
  const conversion = totalLeads > 0 ? Math.round((paidCount / totalLeads) * 100) : 0;

  const bdmNames = Array.from(new Set([...Object.keys(targets), ...leads.map((l) => l.bdm).filter(Boolean)])).sort();
  const bdmPerf = bdmNames.map((bdm) => {
    const bdmLeads = leads.filter((l) => l.bdm === bdm);
    const bdmRevenueLeads = hasPeriod ? revenueLeads.filter((l) => l.bdm === bdm) : bdmLeads;
    const byStatus: Record<string, number> = {};
    for (const s of ["UNTOUCHED", "CONTACTED", "FOLLOW UP/DETAILS SHARED", "CONFIRMED", "PARTLY_PAID", "PAID", "DENIED"]) {
      byStatus[s] = bdmLeads.filter((l) => l.status === s).length;
    }
    const bdmConfirmedPaid = bdmLeads.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
    const bdmPreviousConfirmedPaid = (previousLeads || []).filter((l) => l.bdm === bdm && ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
    const bdmRevenueConfirmedPaid = hasPeriod ? bdmRevenueLeads.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status)) : bdmConfirmedPaid;
    const received = bdmRevenueConfirmedPaid.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
    const pending = bdmConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
    const pendingFromPrevious = bdmPreviousConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
    const expected = bdmConfirmedPaid.reduce((s, l) => s + getSellingPrice(l), 0);
    const target = targets[bdm] ?? 0;
    return {
      bdm,
      leads: bdmLeads.length,
      untouched: byStatus["UNTOUCHED"] ?? 0,
      contacted: byStatus["CONTACTED"] ?? 0,
      followedUp: byStatus["FOLLOW UP/DETAILS SHARED"] ?? 0,
      denied: byStatus["DENIED"] ?? 0,
      confirmed: byStatus["CONFIRMED"] ?? 0,
      partlyPaid: byStatus["PARTLY_PAID"] ?? 0,
      paid: byStatus["PAID"] ?? 0,
      target,
      expected,
      received,
      pending,
      pendingFromPrevious,
      achieved: received,
      percent: target > 0 ? Math.round((received / target) * 100) : 0,
    };
  });

  return NextResponse.json({
    byStatus,
    revenue,
    pending,
    pendingFromPrevious: hasPeriod ? pendingFromPrevious : 0,
    conversion,
    totalLeads,
    bdmPerformance: bdmPerf,
  });
}
