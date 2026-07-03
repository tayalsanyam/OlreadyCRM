import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import {
  callStaffFilter,
  isCallyzerScopeError,
  resolveCallStaffUserIds,
  resolveCallyzerReportScope,
} from "@/lib/callyzer-report-scope";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;
  const assignee = searchParams.get("assignee") ?? "all";
  const roleFilter = searchParams.get("role");

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveCallyzerReportScope(tx, auth.session, assignee);
      if (isCallyzerScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      const creditUserIds = await resolveCallStaffUserIds(tx, scope.userIds);
      const scoped = callStaffFilter(tx, creditUserIds);

      const byStaff = await tx`
        SELECT
          s.id AS "staffId",
          s.name AS "staffName",
          s.role::text AS role,
          COUNT(cl.id)::int AS calls,
          COALESCE(SUM(cl.duration_sec), 0)::int AS "durationSec",
          MAX(cl.called_at) AS "lastCallAt",
          COUNT(*) FILTER (WHERE cl.contact_type = 'unknown')::int AS "unmatchedCalls"
        FROM call_logs cl
        JOIN staff s ON s.id = cl.staff_id
        WHERE ${scoped}
          AND (${from}::date IS NULL OR cl.called_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR cl.called_at::date <= ${to}::date)
          AND (${roleFilter}::text IS NULL OR s.role::text = ${roleFilter})
        GROUP BY s.id, s.name, s.role
        ORDER BY calls DESC, s.name
      `;

      const rows = await tx`
        SELECT cl.called_at::date AS day,
               COUNT(*)::int AS calls,
               COALESCE(SUM(cl.duration_sec), 0)::int AS "durationSec"
        FROM call_logs cl
        JOIN staff s ON s.id = cl.staff_id
        WHERE ${scoped}
          AND (${from}::date IS NULL OR cl.called_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR cl.called_at::date <= ${to}::date)
          AND (${roleFilter}::text IS NULL OR s.role::text = ${roleFilter})
        GROUP BY cl.called_at::date
        ORDER BY cl.called_at::date DESC
      `;

      const staffWithNumbers = await tx<{ id: string; name: string; role: string }[]>`
        SELECT id, name, role::text AS role
        FROM staff
        WHERE active = true
          AND callyzer_number IS NOT NULL
          AND length(regexp_replace(callyzer_number, '\D', '', 'g')) >= 10
        ORDER BY name
      `;

      return { byStaff, rows, staffWithNumbers, scopeLabel: scope.label };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Failed to load call activity";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
