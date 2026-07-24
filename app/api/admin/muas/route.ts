import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  generateMuaDisplayId,
  insertAuditLog,
  paginate,
} from "@/db/index";
import { requireMuaCreateAccess, requireRoles } from "@/lib/api-auth";
import {
  deriveAdminMuaSegment,
  parseAdminMuaListFilters,
} from "@/lib/admin-muas-query";
import { fetchAdminMuaListPage } from "@/lib/admin-mua-list-fetch";
import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { normalizeMua, toDbPlanTier } from "@/lib/db-mappers";
import { resolveMuaRegions, muaMatchesAnyRegion } from "@/lib/mua-region";
import { lookupRegionsForCity } from "@/lib/mua-city-region";
import { normalizeMuaSource, type MuaSource } from "@/lib/mua-source";
import { isMuaNotOnPlan } from "@/lib/mua-active-plan";
import {
  normalizeServiceOfferings,
  serviceNamesFromOfferings,
  type MuaServiceOffering,
} from "@/lib/mua-service-catalog";
import { syncMuaRegions } from "@/lib/mua-regions-db";
import { createUnassignedSalesPipeline } from "@/lib/sales-pipeline-bootstrap";
import {
  existingMuaPhoneMessage,
  findExistingMuaByPhone,
} from "@/lib/mua-phone-duplicate";
import type { Mua, PlanTier, Region } from "@/lib/types";

export type { AdminMuaListItem } from "@/lib/admin-mua-list-item";

export interface CreateMuaPayload {
  name: string;
  city: string;
  regions?: Region[];
  phone?: string | null;
  bio?: string | null;
  services?: string[];
  serviceOfferings?: MuaServiceOffering[];
  source?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  planTier?: PlanTier | null;
  planExpiry?: string | null;
  status?: string;
  businessName?: string | null;
  officialAddress?: string | null;
  gstNumber?: string | null;
  email?: string | null;
  alternatePhone?: string | null;
  businessManagerPhone?: string | null;
  avgRevenueTarget?: number | null;
  preferredContactChannel?: string | null;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const filters = parseAdminMuaListFilters(new URL(request.url).searchParams);

  if (USE_MOCK) {
    const raw = mockStore.getAdminMuas() as AdminMuaListItem[];
    const mapped = raw
      .map((m) => ({
        ...m,
        totalBookingRevenue: m.totalBookingRevenue ?? 0,
        totalBookings: m.totalBookings ?? 0,
        totalPushes: m.totalPushes ?? 0,
        bookingsSincePlanStart: m.bookingsSincePlanStart ?? 0,
        pushesSincePlanStart: m.pushesSincePlanStart ?? 0,
        assuredBookings: m.assuredBookings ?? null,
        monthlyPushTarget: m.monthlyPushTarget ?? null,
        hasPlanHistory: m.hasPlanHistory ?? Boolean(m.planTier),
        salesPipelineId: m.salesPipelineId ?? null,
        segment: deriveAdminMuaSegment({
          planTier: m.planTier,
          planExpiry: m.planExpiry,
          hasPlanHistory: m.hasPlanHistory ?? Boolean(m.planTier),
        }),
      }))
      .filter((m) => {
        if (filters.segment !== "all" && m.segment !== filters.segment) return false;
        if (filters.tag !== "all" && m.adminPlanTag !== filters.tag) return false;
        if (filters.rosterStatus !== "all" && m.status !== filters.rosterStatus) return false;
        if (filters.tiers.length && (!m.planTier || !filters.tiers.includes(m.planTier)))
          return false;
        if (!muaMatchesAnyRegion(m, filters.regions)) return false;
        if (
          filters.sources.length > 0 &&
          (!m.source || !filters.sources.includes(m.source as MuaSource))
        )
          return false;
        const days = m.planExpiry
          ? Math.ceil((new Date(m.planExpiry).getTime() - Date.now()) / 86400000)
          : null;
        if (filters.expiryStatus === "active" && (!m.planTier || days === null || days <= 0))
          return false;
        if (
          filters.expiryStatus === "expiring" &&
          (days === null || days > 30 || days < 0)
        )
          return false;
        if (filters.expiryStatus === "expired" && (days === null || days >= 0)) return false;
        if (filters.expiryStatus === "none" && !isMuaNotOnPlan(m)) return false;
        if (filters.planRm === "none" && m.planRmId) return false;
        if (filters.planRm && filters.planRm !== "none" && m.planRmId !== filters.planRm)
          return false;
        if (filters.salesRm === "assigned" && !m.salesRmId) return false;
        if (
          filters.salesRm === "unassigned" &&
          (m.status !== "active" || !m.hasActiveSalesPipeline || m.salesRmId)
        )
          return false;
        if (filters.pipeline === "has" && !m.hasActiveSalesPipeline) return false;
        if (
          filters.pipeline === "missing" &&
          (m.status !== "active" || m.hasActiveSalesPipeline)
        )
          return false;
        if (filters.salesRmStaffId && m.salesRmId !== filters.salesRmStaffId) return false;
        if (filters.pipelineStage && m.salesPipelineStage !== filters.pipelineStage) return false;
        if (filters.addedDateBasis) {
          const field =
            filters.addedDateBasis === "joined"
              ? m.joinDate?.slice(0, 10)
              : m.createdAt?.slice(0, 10);
          if (!field) return false;
          if (filters.addedFrom && field < filters.addedFrom) return false;
          if (filters.addedTo && field > filters.addedTo) return false;
        }
        if (!filters.q) return true;
        const q = filters.q.toLowerCase();
        const digits = filters.q.replace(/\D/g, "");
        return (
          m.name.toLowerCase().includes(q) ||
          m.city.toLowerCase().includes(q) ||
          m.displayId.toLowerCase().includes(q) ||
          (digits.length >= 4 &&
            (m.phone?.includes(digits.slice(-10)) ||
              m.whatsapp?.includes(digits.slice(-10))))
        );
      });

    const page = paginate(mapped, { page: filters.page, pageSize: filters.pageSize });
    const onPlan = raw.filter((m) => m.planTier).length;
    const expiring = raw.filter((m) => {
      if (!m.planExpiry) return false;
      const d = Math.ceil((new Date(m.planExpiry).getTime() - Date.now()) / 86400000);
      return d >= 0 && d <= 30;
    }).length;

    return NextResponse.json({
      data: {
        items: page.data,
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
        totalPages: page.totalPages,
      },
      meta: { onPlan, expiring, needsSalesRm: 0, missingPipeline: 0 },
      error: null,
    });
  }

  try {
    const result = await fetchAdminMuaListPage(sql, filters);
    return NextResponse.json({
      data: {
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
      meta: result.meta,
      error: null,
    });
  } catch (err) {
    console.error("[GET /api/admin/muas]", err);
    const message = err instanceof Error ? err.message : "Failed to load MUAs";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireMuaCreateAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as CreateMuaPayload;
  const isAdminCreate =
    auth.session.role === "admin" || auth.session.role === "owner";
  const name = body.name?.trim();
  const city = body.city?.trim();
  const phone = (body.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!name || !city) {
    return NextResponse.json(
      { data: null, error: "Name and city are required" },
      { status: 400 }
    );
  }
  if (phone.length !== 10) {
    return NextResponse.json(
      { data: null, error: "A valid 10-digit phone number is required" },
      { status: 400 }
    );
  }

  const explicitRegions = resolveMuaRegions(body.regions ?? [], city);
  const whatsappRaw = (body.whatsapp ?? "").replace(/\D/g, "").slice(-10);
  const whatsapp = whatsappRaw.length === 10 ? whatsappRaw : phone;

  const statusRaw = body.status?.trim() || "active";
  const status = statusRaw === "inactive" ? "inactive" : "active";
  const planTier = isAdminCreate ? body.planTier ?? null : null;
  const planExpiry = planTier ? body.planExpiry ?? null : null;
  const serviceOfferings = normalizeServiceOfferings(
    body.serviceOfferings?.length ? body.serviceOfferings : body.services?.map((name) => ({ name }))
  );
  const services = serviceNamesFromOfferings(serviceOfferings);

  if (USE_MOCK) {
    const existing = mockStore.findMuaByPhone(phone);
    if (existing) {
      return NextResponse.json(
        { data: null, error: existingMuaPhoneMessage(existing) },
        { status: 409 },
      );
    }
    const mua = mockStore.createMua({
      name,
      city,
      phone,
      regions: explicitRegions,
      bio: body.bio ?? null,
      services,
      whatsapp: body.whatsapp ?? null,
      instagram: body.instagram ?? null,
      planTier,
      planExpiry,
      status,
    });
    return NextResponse.json({ data: mua, error: null });
  }

  const existingMua = await findExistingMuaByPhone(sql, phone);
  if (existingMua) {
    return NextResponse.json(
      { data: null, error: existingMuaPhoneMessage(existingMua) },
      { status: 409 },
    );
  }

  const dbTier = toDbPlanTier(planTier);

  const mua = await withTransaction(async (tx) => {
    const duplicate = await findExistingMuaByPhone(tx, phone);
    if (duplicate) return { duplicate };

    const displayId = await generateMuaDisplayId(tx);

    const [created] = await tx<Mua[]>`
      INSERT INTO muas (
        display_id,
        name,
        phone,
        city,
        source,
        bio,
        services,
        service_offerings,
        whatsapp,
        instagram,
        plan_tier,
        plan_expiry,
        status,
        business_name,
        official_address,
        gst_number,
        email,
        alternate_phone,
        business_manager_phone,
        avg_revenue_target,
        preferred_contact_channel
      )
      VALUES (
        ${displayId},
        ${name},
        ${phone},
        ${city},
        ${normalizeMuaSource(body.source)},
        ${body.bio?.trim() || null},
        ${services},
        ${tx.json(serviceOfferings)},
        ${whatsapp},
        ${body.instagram ?? null},
        ${dbTier}::plan_tier,
        ${planExpiry}::date,
        ${status},
        ${body.businessName?.trim() || null},
        ${body.officialAddress?.trim() || null},
        ${body.gstNumber?.trim() || null},
        ${body.email?.trim() || null},
        ${body.alternatePhone?.replace(/\D/g, "").slice(-10) || null},
        ${body.businessManagerPhone?.replace(/\D/g, "").slice(-10) || null},
        ${body.avgRevenueTarget ?? null},
        ${body.preferredContactChannel?.trim() || null}
      )
      RETURNING *
    `;

    if (!created) return { mua: null };

    const regions =
      explicitRegions.length > 0
        ? explicitRegions
        : await lookupRegionsForCity(tx, city);
    await syncMuaRegions(tx, created.id, regions);

    await insertAuditLog(tx, {
      tableName: "muas",
      recordId: created.id,
      action: "create",
      actorId: auth.session.userId,
      changes: { ...body, phone, regions } as unknown as Record<string, unknown>,
    });

    if (planTier) {
      await tx`
        INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, expiry_at)
        VALUES (
          ${created.id}::uuid,
          ${dbTier}::plan_tier,
          ${auth.session.userId}::uuid,
          ${planExpiry}::date
        )
      `;
    }

    await createUnassignedSalesPipeline(tx, {
      muaId: created.id,
      actorId: auth.session.userId,
      muaName: name,
    });

    return { mua: normalizeMua({ ...created, regions, services }) };
  });

  if (!mua) {
    return NextResponse.json({ data: null, error: "Create failed" }, { status: 500 });
  }

  if ("duplicate" in mua && mua.duplicate) {
    return NextResponse.json(
      { data: null, error: existingMuaPhoneMessage(mua.duplicate) },
      { status: 409 },
    );
  }

  const createdMua = "mua" in mua ? mua.mua : null;
  if (!createdMua) {
    return NextResponse.json({ data: null, error: "Create failed" }, { status: 500 });
  }

  return NextResponse.json({ data: createdMua, error: null });
}
