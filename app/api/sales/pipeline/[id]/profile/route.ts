import { NextResponse } from "next/server";
import { insertAuditLog, setAuditActor, withTransaction } from "@/db/index";
import { requireSalesAccess } from "@/lib/api-auth";
import { applyMuaProfileUpdate, type MuaProfileFields } from "@/lib/mua-profile-update";
import { normalizePhone } from "@/lib/phone";
import { resolveMuaRegions } from "@/lib/mua-region";
import { assertPipelineAccess } from "@/lib/sales-pipeline-access";
import { fetchSalesPipelineProfile } from "@/lib/sales-pipeline-profile";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";
import type { Region } from "@/lib/types";

function profileBodyFromRequest(body: Record<string, unknown>): MuaProfileFields {
  const out: MuaProfileFields = {};
  if (body.name !== undefined) out.name = String(body.name);
  if (body.muaName !== undefined) out.name = String(body.muaName);
  if (body.phone !== undefined) out.phone = body.phone as string | null;
  if (body.city !== undefined) out.city = String(body.city);
  if (body.source !== undefined) out.source = body.source as string | null;
  if (body.whatsapp !== undefined) out.whatsapp = body.whatsapp as string | null;
  if (body.instagram !== undefined) out.instagram = body.instagram as string | null;
  if (body.preferredContactChannel !== undefined) {
    out.preferredContactChannel = body.preferredContactChannel as string | null;
  }
  if (body.bio !== undefined) out.bio = body.bio as string | null;
  if (body.specialties !== undefined) out.specialties = body.specialties as string[];
  if (body.serviceOfferings !== undefined) {
    out.serviceOfferings = body.serviceOfferings as MuaServiceOffering[];
  } else if (body.services !== undefined) {
    out.services = body.services as string[];
  }
  if (body.regions !== undefined) out.regions = body.regions as Region[];
  if (body.businessName !== undefined) out.businessName = body.businessName as string | null;
  if (body.officialAddress !== undefined) out.officialAddress = body.officialAddress as string | null;
  if (body.gstNumber !== undefined) out.gstNumber = body.gstNumber as string | null;
  if (body.email !== undefined) out.email = body.email as string | null;
  if (body.alternatePhone !== undefined) out.alternatePhone = body.alternatePhone as string | null;
  if (body.businessManagerPhone !== undefined) {
    out.businessManagerPhone = body.businessManagerPhone as string | null;
  }
  if (body.avgRevenueTarget !== undefined) {
    out.avgRevenueTarget =
      body.avgRevenueTarget === null || body.avgRevenueTarget === ""
        ? null
        : Number(body.avgRevenueTarget);
  }
  return out;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const data = await withTransaction(async (tx) => fetchSalesPipelineProfile(tx, auth.session, id));
    if (!data) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to load profile";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const data = await withTransaction(async (tx) => {
      const pipe = await assertPipelineAccess(tx, auth.session, id);
      await setAuditActor(tx, auth.session.userId);

      const profileBody = profileBodyFromRequest(body);
      const profileKeys = Object.keys(profileBody);

      if (profileBody.phone !== undefined && profileBody.phone !== null) {
        const normalized = normalizePhone(String(profileBody.phone));
        if (normalized.length >= 10) {
          const [dup] = await tx<{ id: string }[]>`
            SELECT m.id
            FROM muas m
            WHERE RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
              AND m.id <> ${pipe.muaId}::uuid
            LIMIT 1
          `;
          if (dup) throw Object.assign(new Error("Phone already used by another MUA"), { status: 409 });
        }
      }

      const [existingMua] = await tx<{ city: string; phone: string | null }[]>`
        SELECT city, phone FROM muas WHERE id = ${pipe.muaId}::uuid
      `;
      if (!existingMua) throw Object.assign(new Error("MUA not found"), { status: 404 });

      if (profileBody.regions !== undefined) {
        const city = profileBody.city ?? existingMua.city ?? "";
        const regions = resolveMuaRegions(profileBody.regions, city);
        if (!regions.length) {
          throw Object.assign(new Error("Select at least one region"), { status: 400 });
        }
        profileBody.regions = regions;
      }

      if (profileKeys.length > 0) {
        const [before] = await tx`SELECT * FROM muas WHERE id = ${pipe.muaId}::uuid`;
        await applyMuaProfileUpdate(tx, pipe.muaId, profileBody, {
          existingCity: existingMua.city,
          existingPhone: existingMua.phone,
        });
        const [after] = await tx`SELECT * FROM muas WHERE id = ${pipe.muaId}::uuid`;
        await insertAuditLog(tx, {
          tableName: "muas",
          recordId: pipe.muaId,
          action: "sales_profile_update",
          actorId: auth.session.userId,
          changes: { before, after, fields: profileKeys },
        });
      }

      const pipelineUpdates: Record<string, unknown> = {};
      if (body.salesNotes !== undefined) pipelineUpdates.sales_notes = body.salesNotes;
      if (body.preferredContactTime !== undefined) {
        pipelineUpdates.preferred_contact_time = body.preferredContactTime;
      }

      if (Object.keys(pipelineUpdates).length > 0) {
        const [before] = await tx`SELECT sales_notes, preferred_contact_time FROM sales.pipeline WHERE id = ${id}::uuid`;
        await tx`
          UPDATE sales.pipeline SET
            sales_notes = COALESCE(${pipelineUpdates.sales_notes ?? null}, sales_notes),
            preferred_contact_time = COALESCE(${pipelineUpdates.preferred_contact_time ?? null}, preferred_contact_time),
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        const [after] = await tx`SELECT sales_notes, preferred_contact_time FROM sales.pipeline WHERE id = ${id}::uuid`;
        await insertAuditLog(tx, {
          tableName: "sales_pipeline",
          recordId: id,
          action: "sales_profile_update",
          actorId: auth.session.userId,
          changes: { before, after },
        });
        await tx`
          INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
          VALUES (
            ${id}::uuid,
            'noteAdded',
            'Profile / notes updated',
            ${auth.session.userId}::uuid,
            ${tx.json({
              fields: [...profileKeys, ...Object.keys(pipelineUpdates)],
            })}
          )
        `;
      }

      return fetchSalesPipelineProfile(tx, auth.session, id);
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
