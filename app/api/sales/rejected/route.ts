import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  listRejectedPipelines,
  resolveTeamScopeForStaff,
} from "@/lib/sales-pipeline-rejected";

export async function GET() {
  const auth = await requireRoles(["salesTl"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await withTransaction(async (tx) => {
    const scope = await resolveTeamScopeForStaff(tx, auth.session.userId, auth.session.role);
    return listRejectedPipelines(tx, {
      teamId: scope.teamId,
      assignedToIds: scope.teamId ? scope.memberIds : [auth.session.userId],
    });
  });

  return NextResponse.json({ data: rows, error: null });
}
