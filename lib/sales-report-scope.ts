import type { TransactionSql } from "@/db/index";
import type { SessionUser } from "@/lib/types";

export type SalesReportScope = {
  userIds: string[];
  /** When true, targets and headline KPIs aggregate across userIds. */
  aggregate: boolean;
  label: string;
};

type ScopeError = { error: string; status: number };

export async function getSalesTeamId(tx: TransactionSql, userId: string) {
  const [self] = await tx<{ teamId: string | null }[]>`
    SELECT team_id AS "teamId" FROM staff WHERE id = ${userId}::uuid
  `;
  return self?.teamId ?? null;
}

/** Team from staff.team_id, or sales.teams row where user is TL. */
export async function resolveTeamForUser(
  tx: TransactionSql,
  userId: string,
): Promise<{ teamId: string | null; teamName: string | null }> {
  const fromStaff = await getSalesTeamId(tx, userId);
  if (fromStaff) {
    const [team] = await tx<{ name: string }[]>`
      SELECT name FROM sales.teams WHERE id = ${fromStaff}::uuid LIMIT 1
    `;
    return { teamId: fromStaff, teamName: team?.name ?? null };
  }
  const [asTl] = await tx<{ id: string; name: string }[]>`
    SELECT id, name FROM sales.teams WHERE tl_id = ${userId}::uuid LIMIT 1
  `;
  if (asTl) return { teamId: asTl.id, teamName: asTl.name };
  return { teamId: null, teamName: null };
}

export type SalesTeamContext = {
  teamId: string | null;
  teamName: string | null;
  memberIds: string[];
};

/** Member IDs a sales user may see in pipeline-style queries. */
export async function resolveSalesTeamContext(
  tx: TransactionSql,
  session: Pick<SessionUser, "userId" | "role">,
): Promise<SalesTeamContext | null> {
  if (session.role === "salesRm") {
    const { teamId, teamName } = await resolveTeamForUser(tx, session.userId);
    return { teamId, teamName, memberIds: [session.userId] };
  }
  if (session.role === "salesTl") {
    const { teamId, teamName } = await resolveTeamForUser(tx, session.userId);
    if (!teamId) {
      return { teamId: null, teamName: null, memberIds: [session.userId] };
    }
    const members = await listTeamSalesMembers(tx, teamId);
    const ids = new Set(members.map((m) => m.id));
    ids.add(session.userId);
    return { teamId, teamName, memberIds: Array.from(ids) };
  }
  return null;
}

/** Member IDs a TL can oversee in team analysis / reports (self + team sales staff). */
export async function resolveTlTeamMemberIds(tx: TransactionSql, tlUserId: string): Promise<string[]> {
  const { teamId } = await resolveTeamForUser(tx, tlUserId);
  if (!teamId) return [tlUserId];
  const members = await listTeamSalesMembers(tx, teamId);
  const ids = new Set(members.map((m) => m.id));
  ids.add(tlUserId);
  return Array.from(ids);
}

type TeamMember = { id: string; name: string; role: string };

export async function listTeamSalesMembers(tx: TransactionSql, teamId: string, includeTl = true): Promise<TeamMember[]> {
  const roleFilter = includeTl
    ? tx`role::text IN ('sales_rm', 'sales_tl')`
    : tx`role::text = 'sales_rm'`;
  return tx<TeamMember[]>`
    SELECT id, name, role::text AS role
    FROM staff
    WHERE team_id = ${teamId}::uuid
      AND active = true
      AND ${roleFilter}
    ORDER BY name
  `;
}

/** Resolves which staff user IDs a sales report query may include. */
export async function resolveSalesReportScope(
  tx: TransactionSql,
  session: Pick<SessionUser, "userId" | "role">,
  assigneeParam: string | null,
): Promise<SalesReportScope | ScopeError> {
  const assignee = assigneeParam?.trim() || "all";

  if (session.role === "salesRm") {
    if (assignee !== "all" && assignee !== "me" && assignee !== session.userId) {
      return { error: "Forbidden", status: 403 };
    }
    return { userIds: [session.userId], aggregate: false, label: "My performance" };
  }

  if (session.role === "salesTl") {
    const { teamId } = await resolveTeamForUser(tx, session.userId);
    if (!teamId) {
      if (assignee === "all") {
        return { userIds: [session.userId], aggregate: false, label: "My performance" };
      }
      if (assignee === "me" || assignee === session.userId) {
        return { userIds: [session.userId], aggregate: false, label: "My performance" };
      }
      return { error: "No team assigned", status: 403 };
    }

    const members = await listTeamSalesMembers(tx, teamId);
    const allowed = new Set(members.map((m) => m.id));
    allowed.add(session.userId);

    if (assignee === "all") {
      const userIds = Array.from(allowed);
      return {
        userIds,
        aggregate: userIds.length > 1,
        label: `All team (${userIds.length})`,
      };
    }
    if (assignee === "me") {
      return { userIds: [session.userId], aggregate: false, label: "My performance" };
    }
    if (!allowed.has(assignee)) {
      return { error: "Team member not in your team", status: 403 };
    }
    const member = members.find((m) => m.id === assignee);
    return {
      userIds: [assignee],
      aggregate: false,
      label: member?.name ?? "Team member",
    };
  }

  if (session.role === "admin" || session.role === "owner") {
    if (assignee === "all") {
      return { userIds: [], aggregate: true, label: "All sales" };
    }
    if (assignee === "me") {
      return { userIds: [session.userId], aggregate: false, label: "My performance" };
    }
    const [row] = await tx<{ id: string; name: string }[]>`
      SELECT id, name FROM staff WHERE id = ${assignee}::uuid AND active = true LIMIT 1
    `;
    if (!row) return { error: "Staff member not found", status: 404 };
    return { userIds: [assignee], aggregate: false, label: row.name };
  }

  return { error: "Forbidden", status: 403 };
}

export function isScopeError(v: SalesReportScope | ScopeError): v is ScopeError {
  return "error" in v;
}

/** Active sales TL for Senior Call — from assignee's team, then MUA team. */
export async function resolveSalesTeamLeadId(
  tx: TransactionSql,
  opts: { assignedTo: string | null; muaTeamId: string | null },
): Promise<string | null> {
  const candidateTeamIds: string[] = [];

  if (opts.assignedTo) {
    const { teamId } = await resolveTeamForUser(tx, opts.assignedTo);
    if (teamId) candidateTeamIds.push(teamId);
  }
  if (opts.muaTeamId) candidateTeamIds.push(opts.muaTeamId);

  const seen = new Set<string>();
  for (const teamId of candidateTeamIds) {
    if (seen.has(teamId)) continue;
    seen.add(teamId);
    const [row] = await tx<{ tlId: string }[]>`
      SELECT st.tl_id AS "tlId"
      FROM sales.teams st
      JOIN staff tl ON tl.id = st.tl_id AND tl.active = true
      WHERE st.id = ${teamId}::uuid
      LIMIT 1
    `;
    if (row?.tlId) return row.tlId;
  }
  return null;
}

/** SQL fragment: pipeline rows for scope (alias `p`). */
export function pipelineAssigneeFilter(tx: TransactionSql, userIds: string[]) {
  if (userIds.length === 0) return tx`TRUE`;
  return tx`p.assigned_to = ANY(${userIds}::uuid[])`;
}

/** SQL fragment: call log rows for scope (alias `c`). */
export function callSalespersonFilter(tx: TransactionSql, userIds: string[]) {
  if (userIds.length === 0) return tx`TRUE`;
  return tx`c.salesperson_id = ANY(${userIds}::uuid[])`;
}

/** SQL fragment: actor on comms (alias `cl`). */
export function commsActorFilter(tx: TransactionSql, userIds: string[]) {
  if (userIds.length === 0) return tx`TRUE`;
  return tx`cl.actor_id = ANY(${userIds}::uuid[])`;
}

/** SQL fragment: pipeline closed-by. Use alias `p` when muas is joined (also has sales_closed_by). */
export function pipelineClosedByFilter(tx: TransactionSql, userIds: string[], alias?: "p") {
  if (userIds.length === 0) return tx`TRUE`;
  if (alias === "p") return tx`p.sales_closed_by = ANY(${userIds}::uuid[])`;
  return tx`sales_closed_by = ANY(${userIds}::uuid[])`;
}
