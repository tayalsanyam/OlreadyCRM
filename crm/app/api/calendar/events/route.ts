import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeads, getSellingPrice, getBalance } from "@/lib/leads";
import { getTasks } from "@/lib/tasks";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const bdm = searchParams.get("bdm");
  const status = searchParams.get("status");

  const filters: { bdm?: string; teamBdms?: string[]; status?: string } = {};
  if (session.user.role === "bdm" && session.user.assigned_bdm)
    filters.bdm = session.user.assigned_bdm;
  if (session.user.role === "team_leader" && session.user.team_id)
    filters.teamBdms = await getBdmsForTeam(session.user.team_id);
  if (bdm) filters.bdm = bdm;
  if (status) filters.status = status;

  const taskFilters: { assignee?: string; assignees?: string[] } = {};
  if (filters.bdm) taskFilters.assignee = filters.bdm;
  if (filters.teamBdms?.length) taskFilters.assignees = filters.teamBdms;
  const [leads, tasks] = await Promise.all([getLeads(filters), getTasks(taskFilters)]);

  const events: { id: string; title: string; date: string; type: string; lead_id?: string; amount?: number }[] = [];

  for (const l of leads) {
    if (l.next_follow_up) {
      events.push({
        id: `f-${l.id}`,
        title: `Follow up: ${l.name}`,
        date: l.next_follow_up,
        type: "follow_up",
        lead_id: l.id,
      });
    }
    if (l.committed_date && ["CONFIRMED", "PARTLY_PAID"].includes(l.status)) {
      const balance = getBalance(l);
      events.push({
        id: `c-${l.id}`,
        title: `Expected: ${l.name} · ₹${(balance || getSellingPrice(l)).toLocaleString()}`,
        date: l.committed_date,
        type: "expected_revenue",
        lead_id: l.id,
        amount: balance || getSellingPrice(l),
      });
    }
    if (l.status === "PAID" && l.last_modified) {
      const d = l.last_modified.slice(0, 10);
      const paid = l.amount_paid ?? getSellingPrice(l);
      events.push({
        id: `p-${l.id}`,
        title: `Paid: ${l.name} · ₹${paid.toLocaleString()}`,
        date: d,
        type: "revenue_received",
        lead_id: l.id,
        amount: paid,
      });
    }
  }
  const leadIds = new Set(leads.map((l) => l.id));
  for (const t of tasks.filter((x) => x.due)) {
    if (status && t.lead_id && !leadIds.has(t.lead_id)) continue;
    events.push({
      id: `t-${t.id}`,
      title: t.title,
      date: t.due,
      type: "task",
      lead_id: t.lead_id,
    });
  }

  let filtered = events;
  if (from || to) {
    filtered = events.filter((e) => {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      return true;
    });
  }

  return NextResponse.json(filtered);
}
