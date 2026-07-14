import { NextResponse } from "next/server";
import { sql, withTransaction, insertAuditLog, setAuditActor } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { AdminPlanTag } from "@/lib/admin-plan-tag";
import { parseAdminPlanTag } from "@/lib/admin-plan-tag";
import {
  applyAdminMuaPlanControlsPatch,
  fetchAdminMuaPlanControlsDetail,
} from "@/lib/admin-mua-plan-controls";
import { supersedeRenewalForAdminExtension } from "@/lib/sales-renewal-track";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  if (USE_MOCK) {
    const detail = mockStore.getAdminMuaPlanControlsDetail(id);
    if (!detail) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: detail, error: null });
  }

  const data = await fetchAdminMuaPlanControlsDetail(id);
  if (!data) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    planExpiry?: string | null;
    weeklyCapOverride?: number | null;
    weeklyCapBonus?: number | null;
    adminPlanTag?: AdminPlanTag | null;
    note?: string | null;
    planRmId?: string | null;
    rmSupport?: boolean | null;
    leadReversal?: boolean | null;
  };

  if (
    body.weeklyCapOverride != null &&
    (!Number.isFinite(body.weeklyCapOverride) || body.weeklyCapOverride < 0)
  ) {
    return NextResponse.json(
      { data: null, error: "Weekly cap override must be 0 or greater" },
      { status: 400 },
    );
  }
  if (
    body.weeklyCapBonus != null &&
    (!Number.isFinite(body.weeklyCapBonus) || body.weeklyCapBonus < 0)
  ) {
    return NextResponse.json(
      { data: null, error: "Bonus pushes must be 0 or greater" },
      { status: 400 },
    );
  }

  const tag =
    body.adminPlanTag === undefined
      ? undefined
      : body.adminPlanTag === null
        ? null
        : parseAdminPlanTag(body.adminPlanTag);

  if (body.adminPlanTag !== undefined && body.adminPlanTag !== null && !tag) {
    return NextResponse.json({ data: null, error: "Invalid plan tag" }, { status: 400 });
  }

  if (USE_MOCK) {
    const ok = mockStore.patchAdminMuaPlanControls(id, body);
    if (!ok) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  try {
    await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);

      const [before] = await tx<{ planExpiry: string | null; planTier: string | null }[]>`
        SELECT plan_expiry::text AS "planExpiry", plan_tier::text AS "planTier"
        FROM muas WHERE id = ${id}::uuid
      `;
      if (!before) {
        throw new Error("Not found");
      }
      if (!before.planTier) {
        throw new Error("MUA has no active plan — assign a plan first");
      }

      await applyAdminMuaPlanControlsPatch(tx, id, auth.session.userId, body);

      const [updated] = await tx<{ id: string }[]>`
        UPDATE muas SET
          plan_expiry = ${
            body.planExpiry === undefined ? tx`plan_expiry` : body.planExpiry
          }::date,
          weekly_cap_override = ${
            body.weeklyCapOverride === undefined
              ? tx`weekly_cap_override`
              : body.weeklyCapOverride
          },
          weekly_cap_bonus = ${
            body.weeklyCapBonus === undefined
              ? tx`weekly_cap_bonus`
              : body.weeklyCapBonus ?? 0
          },
          admin_plan_tag = ${
            body.adminPlanTag === undefined ? tx`admin_plan_tag` : tag
          },
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING id
      `;
      if (!updated) throw new Error("Not found");

      if (body.planExpiry !== undefined && body.planExpiry !== before.planExpiry) {
        await supersedeRenewalForAdminExtension(tx, id, auth.session.userId);
        await tx`
          INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, expiry_at, notes)
          VALUES (
            ${id}::uuid,
            ${before.planTier}::plan_tier,
            ${auth.session.userId}::uuid,
            ${body.planExpiry}::date,
            ${body.note?.trim() || "Admin plan extension / adjustment"}
          )
        `;
      }

      await insertAuditLog(tx, {
        tableName: "muas",
        recordId: id,
        action: "admin_plan_controls",
        actorId: auth.session.userId,
        changes: body as Record<string, unknown>,
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message === "Not found" ? 404 : 400;
    return NextResponse.json({ data: null, error: message }, { status });
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
