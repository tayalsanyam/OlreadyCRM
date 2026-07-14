import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { listTeamSalesMembers, resolveTeamForUser } from "@/lib/sales-report-scope";

export async function GET() {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const data = await withTransaction(async (tx) => {
      const { userId, role } = auth.session;

      if (role === "salesRm") {
        return {
          canFilter: false,
          defaultAssignee: "me",
          options: [{ value: "me", label: "My performance" }],
        };
      }

      if (role === "salesTl") {
        const { teamId } = await resolveTeamForUser(tx, userId);
        const options: Array<{ value: string; label: string }> = [
          { value: "all", label: "All team" },
          { value: "me", label: "My performance" },
        ];
        if (teamId) {
          const members = await listTeamSalesMembers(tx, teamId);
          for (const m of members as Array<{ id: string; name: string }>) {
            if (m.id === userId) continue;
            options.push({ value: m.id, label: m.name });
          }
        }
        return { canFilter: true, defaultAssignee: "all", options };
      }

      const assignees = (await tx`
        SELECT id, name
        FROM staff
        WHERE active = true
          AND role::text IN ('sales_rm', 'sales_tl')
        ORDER BY name
        LIMIT 200
      `) as Array<{ id: string; name: string }>;
      return {
        canFilter: true,
        defaultAssignee: "all",
        options: [
          { value: "all", label: "All sales" },
          { value: "me", label: "My performance" },
          ...assignees.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name })),
        ],
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load report scope";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
