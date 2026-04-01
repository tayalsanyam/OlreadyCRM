import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeads, getSellingPrice, getBalance } from "@/lib/leads";
import { getTasks } from "@/lib/tasks";
import { getBDMTargets } from "@/lib/config";
import { getRenewalDealsByLeadIds } from "@/lib/renewal-deals";
import { STATUSES } from "@/lib/types";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // yyyy-mm
  const monthStart = monthParam
    ? new Date(monthParam + "-01")
    : (() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);
  const monthFrom = monthStart.toISOString().slice(0, 10);
  const monthTo = monthEnd.toISOString().slice(0, 10);

  const filters: { bdm?: string; teamBdms?: string[] } = {};
  if (session.user.role === "bdm" && session.user.assigned_bdm)
    filters.bdm = session.user.assigned_bdm;
  if (session.user.role === "team_leader" && session.user.team_id)
    filters.teamBdms = await getBdmsForTeam(session.user.team_id);

  const taskFilters: { done: boolean; assignee?: string; assignees?: string[] } = { done: false };
  if (filters.bdm) taskFilters.assignee = filters.bdm;
  if (filters.teamBdms?.length) taskFilters.assignees = filters.teamBdms;

  const [leads, tasks, targets] = await Promise.all([
    getLeads(filters),
    getTasks(taskFilters),
    getBDMTargets(),
  ]);

  const renewalDealsRaw = leads.length > 0
    ? await getRenewalDealsByLeadIds(leads.map((l) => l.id)).catch(() => [])
    : [];
  const renewalDealsFollowUp = (Array.isArray(renewalDealsRaw) ? renewalDealsRaw : []).filter(
    (d: { status: string }) => d.status === "RENEWAL_FOLLOW_UP"
  );

  const byStatus: Record<string, number> = {};
  for (const s of STATUSES) byStatus[s] = 0;
  leads.forEach((l) => {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  });

  const confirmedAndPaid = leads.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
  const receivedThisMonth = leads.filter(
    (l) =>
      ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status) &&
      l.last_modified &&
      l.last_modified.slice(0, 10) >= monthFrom &&
      l.last_modified.slice(0, 10) <= monthTo
  );
  const revenue = receivedThisMonth.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
  const untouchedLeads = leads.filter((l) => l.status === "UNTOUCHED");
  const periodLeads = leads.filter(
    (l) => l.created_at && l.created_at.slice(0, 10) >= monthFrom && l.created_at.slice(0, 10) <= monthTo
  );
  const periodLeadsWithUntouched = [...untouchedLeads, ...periodLeads.filter((l) => l.status !== "UNTOUCHED")];
  const periodConfirmedPaid = periodLeadsWithUntouched.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
  const previousConfirmedPaid = confirmedAndPaid.filter(
    (l) => l.created_at && l.created_at.slice(0, 10) < monthFrom
  );
  const pending = periodConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
  const pendingFromPrevious = previousConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
  const expectedRevenue = periodConfirmedPaid.reduce((s, l) => s + getSellingPrice(l), 0);
  const followUps = leads.filter((l) => l.next_follow_up);
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks.filter((t) => t.due && t.due < today);

  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const followUpTasks = tasks
    .filter((t) => t.lead_id)
    .map((t) => ({
      ...t,
      lead_name: leadMap.get(t.lead_id!)?.name ?? "Unknown",
    }));
  const followUpOverdue = followUpTasks.filter((t) => t.due && t.due < today);
  const followUpToday = followUpTasks.filter((t) => t.due === today);
  const followUpUpcoming = followUpTasks.filter((t) => t.due && t.due > today);

  const paymentOverdue = leads.filter(
    (l) =>
      ["CONFIRMED", "PARTLY_PAID"].includes(l.status) &&
      l.committed_date &&
      l.committed_date < today &&
      (getBalance(l) > 0 || (getSellingPrice(l) === 0 && (l.amount_paid ?? 0) === 0))
  );

  const bdmStats = Object.keys(targets).map((bdm) => {
    const bdmLeads = leads.filter((l) => l.bdm === bdm);
    const bdmReceivedThisMonth = bdmLeads.filter(
      (l) =>
        ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status) &&
        l.last_modified &&
        l.last_modified.slice(0, 10) >= monthFrom &&
        l.last_modified.slice(0, 10) <= monthTo
    );
    const bdmPeriodLeads = bdmLeads.filter(
      (l) => l.created_at && l.created_at.slice(0, 10) >= monthFrom && l.created_at.slice(0, 10) <= monthTo
    );
    const bdmPeriodConfirmedPaid = bdmPeriodLeads.filter((l) => ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status));
    const bdmPreviousConfirmedPaid = bdmLeads.filter(
      (l) =>
        ["CONFIRMED", "PARTLY_PAID", "PAID"].includes(l.status) &&
        l.created_at &&
        l.created_at.slice(0, 10) < monthFrom
    );
    const achieved = bdmReceivedThisMonth.reduce((s, l) => s + (l.amount_paid ?? 0), 0);
    const expected = bdmPeriodConfirmedPaid.reduce((s, l) => s + getSellingPrice(l), 0);
    const bdmPending = bdmPeriodConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
    const bdmPendingFromPrevious = bdmPreviousConfirmedPaid.reduce((s, l) => s + Math.max(0, getBalance(l)), 0);
    const target = targets[bdm] ?? 0;
    return {
      bdm,
      target,
      expected,
      achieved,
      paid: achieved,
      pending: bdmPending,
      pendingFromPrevious: bdmPendingFromPrevious,
      balance: target - achieved,
      percent: target > 0 ? Math.round((achieved / target) * 100) : 0,
    };
  });

  const totalTarget = Object.values(targets).reduce((s, t) => s + (t ?? 0), 0);
  const totalPaid = bdmStats.reduce((s, b) => s + (b.achieved ?? 0), 0);
  const totalPending = totalTarget - totalPaid;

  const dealsInFinalStage = confirmedAndPaid.filter((l) => ["CONFIRMED", "PARTLY_PAID"].includes(l.status) && l.committed_date);
  const renewalDealsNeedingAttention = renewalDealsFollowUp.map((d: { id: string; lead_id: string; plan_name: string; next_follow_up?: string }) => ({
    id: d.id,
    lead_id: d.lead_id,
    plan_name: d.plan_name,
    next_follow_up: d.next_follow_up,
    lead_name: leadMap.get(d.lead_id)?.name ?? "Unknown",
  }));
  const todaysFollowUps = leads.filter((l) => l.next_follow_up === today);
  const todaysTasks = tasks.filter((t) => t.due === today);
  const pendingTasksNonFollowUp = tasks.filter((t) => !t.lead_id);

  return NextResponse.json({
    totalLeads: leads.length,
    byStatus,
    revenue,
    pending,
    pendingFromPrevious,
    expectedRevenue,
    followUpCount: followUps.length,
    taskCount: tasks.length,
    overdueCount: overdueTasks.length,
    bdmStats,
    followUpTasks: { overdue: followUpOverdue, today: followUpToday, upcoming: followUpUpcoming },
    paymentOverdue,
    renewalDealsNeedingAttention,
    dealsInFinalStage,
    todaysFollowUps,
    todaysTasks,
    pendingTasksNonFollowUp,
    targetRevenue: {
      totalTarget,
      totalExpected: expectedRevenue,
      totalPaid,
      totalPending,
      totalPendingFromPrevious: pendingFromPrevious,
      bdmStats,
      month: monthFrom,
      monthLabel: monthStart.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    },
  });
}
