import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { callStaffFilter, isCallyzerScopeError, resolveCallyzerReportScope } from "@/lib/callyzer-report-scope";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await withTransaction(async (tx) => {
    const scoped = callStaffFilter(tx, []);

    const staleUsers = await tx<
      {
        id: string;
        name: string;
        role: string;
        lastCallAt: string | null;
        daysSinceLastCall: number | null;
      }[]
    >`
      SELECT
        s.id,
        s.name,
        s.role::text AS role,
        MAX(cl.called_at) AS "lastCallAt",
        CASE
          WHEN MAX(cl.called_at) IS NULL THEN NULL
          ELSE DATE_PART('day', NOW() - MAX(cl.called_at))::int
        END AS "daysSinceLastCall"
      FROM staff s
      LEFT JOIN call_logs cl ON cl.staff_id = s.id
      WHERE s.active = true
        AND COALESCE(s.callyzer_number, '') <> ''
        AND length(regexp_replace(s.callyzer_number, '\D', '', 'g')) >= 10
      GROUP BY s.id, s.name, s.role
      HAVING MAX(cl.called_at) IS NULL OR MAX(cl.called_at) < NOW() - INTERVAL '3 day'
      ORDER BY s.name
    `;

    const [lastSync] = await tx<{ lastSyncAt: string | null; totalCalls: number }[]>`
      SELECT MAX(created_at) AS "lastSyncAt", COUNT(*)::int AS "totalCalls"
      FROM call_logs cl
      WHERE ${scoped}
    `;

    const [mapped] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM staff
      WHERE active = true
        AND callyzer_number IS NOT NULL
        AND length(regexp_replace(callyzer_number, '\D', '', 'g')) >= 10
    `;

    return {
      staleCount: staleUsers.length,
      staleUsers,
      lastSyncAt: lastSync?.lastSyncAt ?? null,
      totalCalls: lastSync?.totalCalls ?? 0,
      mappedStaff: mapped?.count ?? 0,
    };
  });

  return NextResponse.json({ data, error: null });
}
