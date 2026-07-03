import { NextResponse } from "next/server";
import { withTransaction, insertAuditLog, setAuditActor, sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import { regionalRmCanAccessMua } from "@/lib/mua-lead-attached";
import { muaIsPlanRm } from "@/lib/plan-rm";
import { fetchMuaDetail } from "@/lib/mua-detail";
import { applyMuaProfileUpdate, type MuaProfileFields } from "@/lib/mua-profile-update";
import { resolveMuaRegions } from "@/lib/mua-region";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";
import { supersedeRenewalForAdminExtension } from "@/lib/sales-renewal-track";
import { createUnassignedSalesPipeline } from "@/lib/sales-pipeline-bootstrap";
import type { Region, SessionUser } from "@/lib/types";

async function authorizeMua(
  session: SessionUser,
  muaId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (USE_MOCK) {
    const mua = mockStore.getMuaDetail(muaId);
    if (!mua) return { ok: false, status: 404, error: "Not found" };
    if (session.role === "regionalRm" && session.region) {
      const inRegion = mockStore.muaInRegionMock(muaId, session.region);
      const mua = mockStore.getMuaDetail(muaId);
      const isPlanRm = mua?.planRmId === session.userId;
      if (!inRegion && !isPlanRm) {
        return { ok: false, status: 403, error: "Forbidden" };
      }
    } else if (!canAccessMuaByRole(session, true)) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true };
  }

  const detail = await fetchMuaDetail(muaId);
  if (!detail) return { ok: false, status: 404, error: "Not found" };

  let regionOk = true;
  if (session.role === "regionalRm" && session.region) {
    const inRegion = await muaInRegion(muaId, session.region);
    const isPlanRm = await muaIsPlanRm(muaId, session.userId);
    regionOk = await regionalRmCanAccessMua(sql, session, {
      muaId,
      inRegion,
      isPlanRm,
    });
  }
  if (!canAccessMuaByRole(session, regionOk)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

function canEditMuaProfile(session: SessionUser): boolean {
  return session.role === "admin" || session.role === "owner" || session.role === "regionalRm";
}

function canEditMuaPlanFields(session: SessionUser): boolean {
  return session.role === "admin" || session.role === "owner";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const gate = await authorizeMua(auth.session, id);
  if (!gate.ok) {
    return NextResponse.json({ data: null, error: gate.error }, { status: gate.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getMuaDetail(id),
      error: null,
    });
  }

  const data = await fetchMuaDetail(id);
  return NextResponse.json({ data, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (!canEditMuaProfile(auth.session)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as MuaProfileFields & {
    assignedRmId?: string | null;
    planExpiry?: string | null;
    notes?: string | null;
    serviceOfferings?: MuaServiceOffering[];
    regions?: Region[];
    city?: string;
    status?: string;
  };

  const gate = await authorizeMua(auth.session, id);
  if (!gate.ok) {
    return NextResponse.json({ data: null, error: gate.error }, { status: gate.status });
  }

  if (USE_MOCK) {
    const mua = mockStore.updateMua(id, body);
    if (!mua) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: mua, error: null });
  }

  const existing = await fetchMuaDetail(id);
  if (!existing) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  if (body.regions !== undefined) {
    const regions = resolveMuaRegions(body.regions, body.city ?? existing.city);
    if (!regions.length) {
      return NextResponse.json(
        { data: null, error: "Select at least one region" },
        { status: 400 }
      );
    }
    body.regions = regions;
  }

  const adminOnly =
    body.assignedRmId !== undefined ||
    body.planExpiry !== undefined ||
    body.notes !== undefined ||
    body.status !== undefined;
  if (adminOnly && !canEditMuaPlanFields(auth.session)) {
    return NextResponse.json(
      { data: null, error: "Only admins can update plan, roster status, or assignment fields" },
      { status: 403 }
    );
  }

  await withTransaction(async (tx) => {
    await setAuditActor(tx, auth.session.userId);

    const profileBody: MuaProfileFields = { ...body };
    delete (profileBody as Record<string, unknown>).assignedRmId;
    delete (profileBody as Record<string, unknown>).planExpiry;
    delete (profileBody as Record<string, unknown>).notes;

    const profileKeys = Object.keys(profileBody).filter(
      (k) => profileBody[k as keyof MuaProfileFields] !== undefined
    );

    if (profileKeys.length > 0) {
      const fieldsForProfile: MuaProfileFields = { ...profileBody };
      if (!canEditMuaPlanFields(auth.session)) {
        delete fieldsForProfile.status;
      }
      const keys = Object.keys(fieldsForProfile).filter(
        (k) => fieldsForProfile[k as keyof MuaProfileFields] !== undefined
      );
      if (keys.length > 0) {
        await applyMuaProfileUpdate(tx, id, fieldsForProfile, {
          existingCity: existing.city,
          existingPhone: existing.phone,
        });
        if (
          fieldsForProfile.status === "active" &&
          existing.status === "inactive"
        ) {
          await createUnassignedSalesPipeline(tx, {
            muaId: id,
            actorId: auth.session.userId,
            muaName: existing.name,
          });
        }
      }
    }

    if (canEditMuaPlanFields(auth.session)) {
      if (
        body.assignedRmId !== undefined ||
        body.planExpiry !== undefined
      ) {
        await tx`
          UPDATE muas SET
            assigned_rm_id = ${
              body.assignedRmId !== undefined
                ? body.assignedRmId
                : tx.unsafe("assigned_rm_id")
            }::uuid,
            plan_expiry = ${
              body.planExpiry !== undefined ? body.planExpiry : tx.unsafe("plan_expiry")
            }::date,
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
      }

      if (body.notes) {
        await tx`
          INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, notes)
          SELECT id, plan_tier, ${auth.session.userId}::uuid, ${body.notes}
          FROM muas WHERE id = ${id}::uuid
        `;
      }

      if (body.planExpiry !== undefined && body.planExpiry !== existing.planExpiry) {
        await supersedeRenewalForAdminExtension(tx, id, auth.session.userId);
      }
    }

    await insertAuditLog(tx, {
      tableName: "muas",
      recordId: id,
      action: "update_profile",
      actorId: auth.session.userId,
      changes: body,
    });
  });

  const data = await fetchMuaDetail(id);
  return NextResponse.json({ data, error: null });
}
