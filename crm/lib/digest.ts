import { getUsers } from "./users";
import { getTasks } from "./tasks";
import { getLeads } from "./leads";
import { getBdmsForTeam } from "./teams";
import type { User, Task, Lead } from "./types";

const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const from = process.env.DAILY_DIGEST_FROM || "Olready CRM <onboarding@resend.dev>";
const resendKey = process.env.RESEND_API_KEY;

export type DigestRecipient = {
  email: string;
  name: string;
  role: "admin" | "team_leader" | "bdm";
  overdueTasks: Task[];
  todayTasks: Task[];
  followUpsToday: Lead[];
  byBdm?: Record<string, { overdue: Task[]; today: Task[] }>; // for admin
};

function taskRows(tasks: Task[], leadMap: Map<string, Lead>): string {
  return tasks
    .map(
      (t) =>
        `<tr><td>${t.title}</td><td>${t.lead_id ? leadMap.get(t.lead_id)?.name ?? "-" : "-"}</td><td>${t.assignee}</td><td>${t.due}</td></tr>`
    )
    .join("");
}

function followUpRows(leads: Lead[]): string {
  return leads
    .map((l) => `<tr><td><a href="${base}/leads/${l.id}">${l.name}</a></td><td>${l.bdm}</td></tr>`)
    .join("");
}

function buildHtml(d: DigestRecipient, date: string, leadMap: Map<string, Lead>): string {

  let content = "";
  if (d.byBdm && Object.keys(d.byBdm).length) {
    content = Object.entries(d.byBdm)
      .map(
        ([bdm, { overdue, today }]) => `
          <h3>${bdm}</h3>
          <p><strong>Overdue:</strong> ${overdue.length}</p>
          <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse;margin-bottom:12px">
            <tr><th>Task</th><th>Lead</th><th>Assignee</th><th>Due</th></tr>
            ${taskRows(overdue, leadMap) || "<tr><td colspan=4>None</td></tr>"}
          </table>
          <p><strong>Due today:</strong> ${today.length}</p>
          <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse;margin-bottom:12px">
            <tr><th>Task</th><th>Lead</th><th>Assignee</th><th>Due</th></tr>
            ${taskRows(today, leadMap) || "<tr><td colspan=4>None</td></tr>"}
          </table>`
      )
      .join("");
  } else {
    content = `
      <h2>Overdue Tasks (${d.overdueTasks.length})</h2>
      <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
        <tr><th>Task</th><th>Lead</th><th>Assignee</th><th>Due</th></tr>
        ${taskRows(d.overdueTasks, leadMap) || "<tr><td colspan=4>None</td></tr>"}
      </table>
      <h2>Tasks Due Today (${d.todayTasks.length})</h2>
      <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
        <tr><th>Task</th><th>Lead</th><th>Assignee</th><th>Due</th></tr>
        ${taskRows(d.todayTasks, leadMap) || "<tr><td colspan=4>None</td></tr>"}
      </table>`;
  }

  content += `
      <h2>Follow-ups Today (${d.followUpsToday.length})</h2>
      <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
        <tr><th>Lead</th><th>BDM</th></tr>
        ${followUpRows(d.followUpsToday) || "<tr><td colspan=2>None</td></tr>"}
      </table>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Daily Digest</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h1>Daily Digest – ${date}</h1>
  <p>Hi ${d.name},</p>
  ${content}
  <p><a href="${base}/tasks">View Tasks</a> | <a href="${base}">Dashboard</a></p>
</body>
</html>`;
}

export async function buildDigestsForUsers(): Promise<{ recipients: DigestRecipient[]; leadMap: Map<string, Lead> }> {
  const today = new Date().toISOString().slice(0, 10);
  const [users, tasks, leads] = await Promise.all([
    getUsers(),
    getTasks({ done: false }),
    getLeads({}),
  ]);

  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const overdueTasks = tasks.filter((t) => t.due && t.due < today);
  const todayTasks = tasks.filter((t) => t.due === today);
  const followUpsToday = leads.filter((l) => l.next_follow_up === today);

  const recipients: DigestRecipient[] = [];

  for (const user of users) {
    const email = user.email?.trim();
    if (!email) continue;

    if (user.role === "bdm") {
      const assignee = user.username;
      recipients.push({
        email,
        name: user.username,
        role: "bdm",
        overdueTasks: overdueTasks.filter((t) => t.assignee === assignee),
        todayTasks: todayTasks.filter((t) => t.assignee === assignee),
        followUpsToday: followUpsToday.filter((l) => l.bdm === user.assigned_bdm),
      });
    } else if (user.role === "team_leader" && user.team_id) {
      const teamBdms = await getBdmsForTeam(user.team_id);
      const teamBdmSet = new Set(teamBdms);
      recipients.push({
        email,
        name: user.username,
        role: "team_leader",
        overdueTasks: overdueTasks.filter((t) => {
          const lead = t.lead_id ? leadMap.get(t.lead_id) : null;
          return lead && teamBdmSet.has(lead.bdm);
        }),
        todayTasks: todayTasks.filter((t) => {
          const lead = t.lead_id ? leadMap.get(t.lead_id) : null;
          return lead && teamBdmSet.has(lead.bdm);
        }),
        followUpsToday: followUpsToday.filter((l) => teamBdmSet.has(l.bdm)),
      });
    } else if (user.role === "admin") {
      const byBdm: Record<string, { overdue: Task[]; today: Task[] }> = {};
      for (const t of [...overdueTasks, ...todayTasks]) {
        const lead = t.lead_id ? leadMap.get(t.lead_id) : null;
        const bdm = lead?.bdm ?? t.assignee ?? "Other";
        if (!byBdm[bdm]) byBdm[bdm] = { overdue: [], today: [] };
        if (t.due && t.due < today) byBdm[bdm].overdue.push(t);
        else if (t.due === today) byBdm[bdm].today.push(t);
      }
      recipients.push({
        email,
        name: user.username,
        role: "admin",
        overdueTasks,
        todayTasks,
        followUpsToday,
        byBdm,
      });
    }
  }

  const fallbackEmails = process.env.DAILY_DIGEST_EMAILS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  if (recipients.length === 0 && fallbackEmails.length) {
    const byBdm: Record<string, { overdue: Task[]; today: Task[] }> = {};
    for (const t of [...overdueTasks, ...todayTasks]) {
      const lead = t.lead_id ? leadMap.get(t.lead_id) : null;
      const bdm = lead?.bdm ?? t.assignee ?? "Other";
      if (!byBdm[bdm]) byBdm[bdm] = { overdue: [], today: [] };
      if (t.due && t.due < today) byBdm[bdm].overdue.push(t);
      else if (t.due === today) byBdm[bdm].today.push(t);
    }
    for (const em of fallbackEmails) {
      recipients.push({
        email: em,
        name: "Admin",
        role: "admin",
        overdueTasks,
        todayTasks,
        followUpsToday,
        byBdm,
      });
    }
  }
  return { recipients, leadMap };
}

export async function sendDigests(): Promise<{ sent: number; errors: string[] }> {
  const { recipients, leadMap } = await buildDigestsForUsers();
  const today = new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  let sent = 0;

  if (!resendKey) {
    return { sent: 0, errors: ["RESEND_API_KEY not configured"] };
  }

  const fromAddr = from.includes("@") ? from : `Olready CRM <${from}>`;

  for (const r of recipients) {
    try {
      const html = buildHtml(r, today, leadMap);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: fromAddr,
          to: r.email,
          subject: `Daily Digest – ${today} – Tasks & Follow-ups`,
          html,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        errors.push(`${r.email}: ${err}`);
      } else {
        sent++;
      }
    } catch (e) {
      errors.push(`${r.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { sent, errors };
}
