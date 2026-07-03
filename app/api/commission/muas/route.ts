import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { citiesForRegions } from "@/lib/mua-region";
import { fetchRegionsByMuaIds } from "@/lib/mua-regions-db";
import {
  fetchCommissionMuasPage,
  type CommissionMuaExpiryFilter,
  type CommissionMuaRow,
} from "@/lib/commission-muas-query";
import { parseAdminPlanTag, type AdminPlanTag } from "@/lib/admin-plan-tag";
import { normalizeMua, toDbPlanTier } from "@/lib/db-mappers";
import { isMuaNotOnPlan } from "@/lib/mua-active-plan";
import { paginate, startOfWeekMonday } from "@/db/index";
import type { PlanTier, Region } from "@/lib/types";

export interface CommissionMuaListItem extends CommissionMuaRow {
  regions?: Region[];
}

function expiryDays(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function matchesExpiry(
  planTier: PlanTier | null,
  planExpiry: string | null,
  filter: CommissionMuaExpiryFilter
): boolean {
  if (filter === "all") return true;
  const days = expiryDays(planExpiry);
  if (filter === "active") return !!planTier && days !== null && days > 0;
  if (filter === "expiring") return days !== null && days >= 0 && days <= 30;
  if (filter === "expired") return days !== null && days < 0;
  if (filter === "none") return isMuaNotOnPlan({ planTier, planExpiry });
  return true;
}

function filterMockList(
  list: CommissionMuaListItem[],
  opts: {
    search: string | null;
    city: string | null;
    expiry: CommissionMuaExpiryFilter;
    pushedFrom: string | null;
    pushedTo: string | null;
    adminTag: AdminPlanTag | "all" | "untagged";
    tier: PlanTier | null;
    availableOnly: boolean;
  }
): CommissionMuaListItem[] {
  const q = opts.search?.trim().toLowerCase();
  return list.filter((m) => {
    if (opts.tier && m.planTier !== opts.tier) return false;
    if (opts.availableOnly && !(m.weeklyCap > 0 && m.weeklyUsed < m.weeklyCap)) {
      return false;
    }
    if (
      q &&
      !m.name.toLowerCase().includes(q) &&
      !m.city.toLowerCase().includes(q) &&
      !(m.phone?.toLowerCase().includes(q) ?? false) &&
      !(m.whatsapp?.toLowerCase().includes(q) ?? false)
    ) {
      return false;
    }
    if (opts.city && m.city !== opts.city) return false;
    if (!matchesExpiry(m.planTier, m.planExpiry, opts.expiry)) return false;
    if (opts.pushedFrom && (!m.lastPushed || m.lastPushed.slice(0, 10) < opts.pushedFrom)) {
      return false;
    }
    if (opts.pushedTo && (!m.lastPushed || m.lastPushed.slice(0, 10) > opts.pushedTo)) {
      return false;
    }
    if (opts.adminTag === "untagged" && m.adminPlanTag) return false;
    if (
      opts.adminTag !== "all" &&
      opts.adminTag !== "untagged" &&
      m.adminPlanTag !== opts.adminTag
    ) {
      return false;
    }
    return true;
  });
}

export async function GET(request: Request) {
  const auth = await requireRoles([
    "commissionRm",
    "feedbackRm",
    "careAgent",
    "admin",
    "owner",
  ]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const regions = searchParams.getAll("region").filter((r): r is Region =>
    ["north", "east", "west", "south"].includes(r)
  );
  const tier = searchParams.get("tier") as PlanTier | null;
  const availableOnly = searchParams.get("availableOnly") === "true";
  const search = searchParams.get("q");
  const city = searchParams.get("city");
  const expiry = (searchParams.get("expiry") ?? "all") as CommissionMuaExpiryFilter;
  const pushedFrom = searchParams.get("pushedFrom");
  const pushedTo = searchParams.get("pushedTo");
  const adminTagRaw = searchParams.get("adminTag");
  const adminTag: AdminPlanTag | "all" | "untagged" =
    adminTagRaw === "untagged"
      ? "untagged"
      : adminTagRaw && adminTagRaw !== "all"
        ? (parseAdminPlanTag(adminTagRaw) ?? "all")
        : "all";
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "50")));

  if (USE_MOCK) {
    let list = mockStore.getCommissionMuas(
      regions.length ? { regions } : undefined
    ) as CommissionMuaListItem[];
    list = filterMockList(list, {
      search,
      city,
      expiry,
      pushedFrom,
      pushedTo,
      adminTag,
      tier,
      availableOnly,
    });
    return NextResponse.json({
      data: paginate(list, { page, pageSize }),
      error: null,
    });
  }

  const monday = startOfWeekMonday();
  const tierDb = tier ? toDbPlanTier(tier) : null;
  const regionCities = regions.length ? citiesForRegions(regions) : [];
  const offset = (Math.max(1, page) - 1) * pageSize;

  try {
    const { rows, total } = await fetchCommissionMuasPage({
      regions,
      regionCities,
      tierDb,
      availableOnly,
      monday,
      pageSize,
      offset,
      search,
      city,
      expiry,
      pushedFrom,
      pushedTo,
      adminTag,
    });

    const regionMap = await fetchRegionsByMuaIds(rows.map((m) => m.id));
    const data = rows.map((m) =>
      normalizeMua({
        ...m,
        adminPlanTag: parseAdminPlanTag(m.adminPlanTag),
        regions: regionMap.get(m.id) ?? [],
      })
    );

    const totalPages = Math.ceil(total / pageSize) || 1;

    return NextResponse.json({
      data: {
        data,
        total,
        page: Math.max(1, page),
        pageSize,
        totalPages,
      },
      error: null,
    });
  } catch (err) {
    console.error("[commission/muas]", err);
    return NextResponse.json(
      {
        data: null,
        error: err instanceof Error ? err.message : "Failed to load MUAs",
      },
      { status: 500 }
    );
  }
}
