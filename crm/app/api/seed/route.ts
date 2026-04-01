import { NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getBDMs, getPlans, saveBDMs, savePlans, saveBDMTargets } from "@/lib/config";
import { getTeams, saveTeams } from "@/lib/teams";
import { createLead, recordPayment } from "@/lib/leads";
import { createTask } from "@/lib/tasks";
import { addActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export async function POST() {
  try {
    const session = await getSession();
    if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const leadsCreated: string[] = [];
    const tasksCreated: string[] = [];

    let bdms = await getBDMs();
    if (bdms.length === 0) {
      await saveBDMs(["GAURAV", "GURKIRAN", "VISHAL"]);
      await saveBDMTargets({ GAURAV: 50000, GURKIRAN: 60000, VISHAL: 45000 });
      bdms = ["GAURAV", "GURKIRAN", "VISHAL"];
    }

    let plans = await getPlans();
    if (plans.length === 0) {
      await savePlans([
        { name: "Basic 10k", price: 10000, active: true },
        { name: "Pro 20k", price: 20000, active: true },
        { name: "Premium 35k", price: 35000, active: true },
      ]);
      plans = await getPlans();
    }

    let teams = await getTeams();
    if (teams.length === 0) {
      await saveTeams([
        { team_id: "sales-1", team_name: "Sales Team 1", bdm: "GAURAV" },
        { team_id: "sales-1", team_name: "Sales Team 1", bdm: "GURKIRAN" },
        { team_id: "sales-2", team_name: "Sales Team 2", bdm: "VISHAL" },
      ]);
    }

    const bdm1 = bdms[0] ?? "GAURAV";
    const bdm2 = bdms[1] ?? bdm1;
    const plan1 = plans[0]?.name ?? "Basic 10k";

    const sampleLeads = [
      { name: "Rahul Sharma", city: "Mumbai", company: "TechCorp", phone: "9876543210", bdm: bdm1, plan: plan1, status: "UNTOUCHED" as const },
      { name: "Priya Singh", city: "Delhi", company: "DesignStudio", email: "priya@test.com", bdm: bdm1, plan: plan1, status: "CONTACTED" as const, next_follow_up: TODAY },
      { name: "Amit Patel", city: "Bangalore", bdm: bdm2, plan: plan1, status: "FOLLOW UP/DETAILS SHARED" as const, next_follow_up: TOMORROW },
      { name: "Sneha Reddy", city: "Hyderabad", company: "StartUpX", phone: "9876543211", bdm: bdm2, plan: plan1, status: "CONFIRMED" as const, committed_date: TOMORROW, original_price: 18000, discount: 2000 },
      { name: "Vikram Kumar", city: "Chennai", bdm: bdm1, plan: plan1, status: "PAID" as const, original_price: 20000, discount: 0 },
    ];

    for (const l of sampleLeads) {
      let lead = await createLead({
        name: l.name,
        city: l.city,
        company: l.company,
        email: l.email,
        phone: l.phone,
        bdm: l.bdm,
        plan: l.plan,
        status: l.status === "PAID" ? "CONFIRMED" : l.status,
        source: "seed",
        remarks: "Sample data",
        next_follow_up: l.next_follow_up,
        committed_date: l.committed_date,
        original_price: l.original_price,
        discount: l.discount,
      });
      if (l.status === "PAID" && l.original_price) {
        lead = (await recordPayment(lead.id, l.original_price, "UPI")) ?? lead;
      }
      leadsCreated.push(lead.id);
      try {
        await addActivity(lead.id, "Created", "admin", "Seeded sample data");
      } catch {
        /* ignore */
      }
    }

    const sampleTasks = [
      { title: "Follow up: Rahul Sharma", assignee: bdm1, due: TODAY, lead_id: leadsCreated[0] },
      { title: "Follow up: Priya Singh", assignee: bdm1, due: TODAY, lead_id: leadsCreated[1] },
      { title: "Send proposal to Amit Patel", assignee: bdm2, due: TOMORROW, lead_id: leadsCreated[2] },
      { title: "Cold call new leads", assignee: bdm2, due: TODAY },
    ];

    for (const t of sampleTasks) {
      const task = await createTask({
        title: t.title,
        due: t.due,
        assignee: t.assignee,
        done: false,
        lead_id: t.lead_id,
      });
      tasksCreated.push(task.id);
    }

    return NextResponse.json({
      ok: true,
      leadsCreated: leadsCreated.length,
      tasksCreated: tasksCreated.length,
      leadIds: leadsCreated,
      taskIds: tasksCreated,
    });
  } catch (e) {
    console.error("Seed error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
