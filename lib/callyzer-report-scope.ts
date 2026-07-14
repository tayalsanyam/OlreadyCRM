import type { TransactionSql } from "@/db/index";
import type { SessionUser, UserRole } from "@/lib/types";
import { expandCallyzerReportUserIds } from "@/lib/callyzer-identity";
import {
  getSalesTeamId,
  listTeamSalesMembers,
  isScopeError as isSalesScopeError,
  resolveSalesReportScope,
} from "@/lib/sales-report-scope";

export type CallyzerReportScope = {
  userIds: string[];
  aggregate: boolean;
  label: string;
};

type ScopeError = { error: string; status: number };

export const CALL_REPORT_ROLES: UserRole[] = [
  "regionalRm",
  "commissionRm",
  "leadUploader",
  "feedbackRm",
  "salesRm",
  "salesTl",
  "salesActivation",
  "admin",
  "owner",
];

export async function resolveCallyzerReportScope(
  tx: TransactionSql,
  session: Pick<SessionUser, "userId" | "role">,
  assigneeParam: string | null,
): Promise<CallyzerReportScope | ScopeError> {
  const assignee = assigneeParam?.trim() || "me";

  if (session.role === "admin" || session.role === "owner") {
    if (assignee === "all") {
      return { userIds: [], aggregate: true, label: "All staff" };
    }
    if (assignee === "me") {
      return { userIds: [session.userId], aggregate: false, label: "My calls" };
    }
    const [row] = await tx<{ id: string; name: string }[]>`
      SELECT id, name FROM staff WHERE id = ${assignee}::uuid AND active = true LIMIT 1
    `;
    if (!row) return { error: "Staff member not found", status: 404 };
    return { userIds: [assignee], aggregate: false, label: row.name };
  }

  if (session.role === "salesTl" || session.role === "salesRm") {
    const salesScope = await resolveSalesReportScope(tx, session, assignee === "me" ? "me" : assignee);
    if (isSalesScopeError(salesScope)) return salesScope;
    return {
      userIds: salesScope.userIds,
      aggregate: salesScope.aggregate,
      label: salesScope.label,
    };
  }

  if (
    session.role === "regionalRm" ||
    session.role === "commissionRm" ||
    session.role === "leadUploader" ||
    session.role === "feedbackRm" ||
    session.role === "salesActivation"
  ) {
    if (assignee !== "me" && assignee !== session.userId) {
      return { error: "Forbidden", status: 403 };
    }
    return { userIds: [session.userId], aggregate: false, label: "My calls" };
  }

  return { error: "Forbidden", status: 403 };
}

export function isCallyzerScopeError(v: CallyzerReportScope | ScopeError): v is ScopeError {
  return "error" in v;
}

export function callStaffFilter(tx: TransactionSql, userIds: string[]) {
  if (userIds.length === 0) return tx`1=1`;
  if (userIds.length === 1) return tx`cl.staff_id = ${userIds[0]!}::uuid`;
  return tx`cl.staff_id = ANY(${userIds}::uuid[])`;
}

/** Expand assignee ids to sibling logins on the same Callyzer line (sync filter after await). */
export async function resolveCallStaffUserIds(
  tx: TransactionSql,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  return expandCallyzerReportUserIds(tx, userIds);
}

export async function listCallyzerReportAssignees(
  tx: TransactionSql,
  session: Pick<SessionUser, "userId" | "role">,
): Promise<{ canFilter: boolean; defaultAssignee: string; options: { value: string; label: string }[] }> {
  if (session.role === "admin" || session.role === "owner") {
    const rows = await tx<{ id: string; name: string; role: string }[]>`
      SELECT id, name, role::text AS role
      FROM staff
      WHERE active = true
        AND callyzer_number IS NOT NULL
        AND length(regexp_replace(callyzer_number, '\D', '', 'g')) >= 10
      ORDER BY name
    `;
    return {
      canFilter: true,
      defaultAssignee: "all",
      options: [
        { value: "all", label: "All staff with Callyzer" },
        ...rows.map((r: { id: string; name: string; role: string }) => ({
          value: r.id,
          label: `${r.name} (${r.role.replace(/_/g, " ")})`,
        })),
      ],
    };
  }

  if (session.role === "salesTl") {
    const teamId = await getSalesTeamId(tx, session.userId);
    if (!teamId) {
      return {
        canFilter: false,
        defaultAssignee: "me",
        options: [{ value: "me", label: "My calls" }],
      };
    }
    const members = await listTeamSalesMembers(tx, teamId, true);
    return {
      canFilter: true,
      defaultAssignee: "all",
      options: [
        { value: "all", label: "All team" },
        { value: "me", label: "My calls" },
        ...members
          .filter((m) => m.id !== session.userId)
          .map((m) => ({ value: m.id, label: m.name })),
      ],
    };
  }

  return {
    canFilter: false,
    defaultAssignee: "me",
    options: [{ value: "me", label: "My calls" }],
  };
}
