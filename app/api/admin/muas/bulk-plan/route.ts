import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  applyAdminPlanToMua,
  validateAdminPlanAssign,
  type AdminPlanAssignPayload,
} from "@/lib/admin-apply-plan";
import type { PlanTier } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    muaIds: string[];
  } & AdminPlanAssignPayload;

  const ids = body.muaIds?.filter(Boolean) ?? [];
  if (!ids.length) {
    return NextResponse.json(
      { data: null, error: "No MUAs selected" },
      { status: 400 },
    );
  }

  const validationError = validateAdminPlanAssign(body);
  if (validationError) {
    return NextResponse.json({ data: null, error: validationError }, { status: 400 });
  }

  try {
    await withTransaction(async (tx) => {
      const prior = await tx<{ id: string; planExpiry: string | null }[]>`
        SELECT id, plan_expiry::text AS "planExpiry" FROM muas WHERE id = ANY(${ids}::uuid[])
      `;
      const priorMap = new Map<string, string | null>(
        prior.map((r: { id: string; planExpiry: string | null }) => [r.id, r.planExpiry]),
      );

      for (const id of ids) {
        await applyAdminPlanToMua(tx, id, auth.session.userId, body, {
          priorExpiry: priorMap.get(id) ?? null,
        });
      }
    });

    return NextResponse.json({
      data: { updated: ids.length },
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bulk plan update failed";
    console.error("PATCH /api/admin/muas/bulk-plan:", message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
