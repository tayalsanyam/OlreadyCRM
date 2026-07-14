import { NextResponse } from "next/server";
import { sql, withTransaction, setAuditActor } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { Mua } from "@/lib/types";
import { normalizeMua } from "@/lib/db-mappers";
import {
  applyAdminPlanToMua,
  validateAdminPlanAssign,
  type AdminPlanAssignPayload,
} from "@/lib/admin-apply-plan";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as AdminPlanAssignPayload;

  const validationError = validateAdminPlanAssign(body);
  if (validationError) {
    return NextResponse.json({ data: null, error: validationError }, { status: 400 });
  }

  if (USE_MOCK) {
    const mua = mockStore.updateMua(id, {
      planTier: body.planTier === "__remove__" || body.planTier === null ? null : body.planTier ?? null,
      planExpiry: body.planExpiry ?? null,
      city: body.city ?? undefined,
    });
    if (!mua) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: mua, error: null });
  }

  let mua: Mua | undefined;
  let priorExpiry: string | null = null;
  await withTransaction(async (tx) => {
    await setAuditActor(tx, auth.session.userId);
    const [before] = await tx<{ planExpiry: string | null }[]>`
      SELECT plan_expiry::text AS "planExpiry" FROM muas WHERE id = ${id}::uuid
    `;
    priorExpiry = before?.planExpiry ?? null;

    await applyAdminPlanToMua(tx, id, auth.session.userId, body, { priorExpiry });

    const [updated] = await tx<Mua[]>`SELECT * FROM muas WHERE id = ${id}::uuid`;
    mua = updated;
  });

  if (!mua) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: normalizeMua(mua), error: null });
}
