import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  deriveBudgetTierRangeLabels,
  mergeBudgetTierConfig,
  normalizeBudgetTierLimits,
  type BudgetTierLimitsConfig,
} from "@/lib/budget-tier";
import type { BudgetTier, Plan, SlaConfig } from "@/lib/types";
import { DEFAULT_LEAD_SOURCES } from "@/lib/types";
import type { WhatsAppConfig } from "@/lib/whatsapp/config";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/config";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: {
        sla: mockStore.getSla(),
        plans: mockStore.getPlans(),
        whatsapp: resolveWhatsAppConfig(mockStore.getWhatsAppConfig()),
      },
      error: null,
    });
  }

  const [sla] = await sql<SlaConfig[]>`SELECT * FROM sla_config WHERE id = 1`;
  const plans = await sql<Plan[]>`
    SELECT
      id,
      tier,
      name,
      weekly_cap AS "weeklyCap",
      monthly_push_target AS "monthlyPushTarget",
      assured_bookings AS "assuredBookings",
      list_price_inr AS "listPriceInr",
      plan_summary AS "planSummary",
      sort_order AS "sortOrder",
      active,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM plan_tiers
    ORDER BY sort_order
  `;
  const stored = (sla?.whatsappConfig as WhatsAppConfig | undefined) ?? {};
  return NextResponse.json({
    data: {
      sla: sla ? enrichSla(sla) : sla,
      plans,
      whatsapp: resolveWhatsAppConfig(stored),
    },
    error: null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    group:
      | "sla"
      | "plans"
      | "ceremonies"
      | "planReorder"
      | "budgetTierRanges"
      | "budgetTierLimits"
      | "leadSources"
      | "whatsappConfig";
    data: Record<string, unknown>;
  };

  if (USE_MOCK) {
    if (body.group === "sla") {
      mockStore.updateSla(body.data as Partial<SlaConfig>);
    }
    if (body.group === "plans" && body.data.id) {
      mockStore.updatePlan(body.data.id as string, body.data as Partial<Plan>);
    }
    if (body.group === "ceremonies" && Array.isArray(body.data.ceremonyTypes)) {
      mockStore.updateSla({
        ceremonyTypes: body.data.ceremonyTypes as string[],
      });
    }
    if (body.group === "budgetTierLimits" && body.data.limits) {
      const limits = normalizeBudgetTierLimits(body.data.limits);
      mockStore.updateSla({
        budgetTierLimits: limits,
        budgetTierRanges: deriveBudgetTierRangeLabels(limits),
      });
    }
    if (body.group === "whatsappConfig") {
      mockStore.updateWhatsAppConfig(body.data as WhatsAppConfig);
    }
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (body.group === "sla") {
    await sql`
      UPDATE sla_config SET
        per_lead_cap = COALESCE(${body.data.perLeadCap as number}, per_lead_cap),
        assignment_window_days = COALESCE(${body.data.assignmentWindowDays as number}, assignment_window_days),
        shift_warning_day = COALESCE(${body.data.shiftWarningDay as number}, shift_warning_day),
        inactivity_threshold_hours = COALESCE(${body.data.inactivityThresholdHours as number}, inactivity_threshold_hours),
        cap_bypass_days = COALESCE(${body.data.capBypassDays as number}, cap_bypass_days),
        critical_max_days = COALESCE(${body.data.criticalMaxDays as number}, critical_max_days),
        hot_max_days = COALESCE(${body.data.hotMaxDays as number}, hot_max_days),
        active_max_days = COALESCE(${body.data.activeMaxDays as number}, active_max_days),
        auto_assign_enabled = COALESCE(${body.data.autoAssignEnabled as boolean}, auto_assign_enabled),
        auto_assign_by = COALESCE(${body.data.autoAssignBy as string}, auto_assign_by),
        updated_at = NOW()
      WHERE id = 1
    `;
  }

  if (body.group === "plans" && body.data.id) {
    await sql`
      UPDATE plan_tiers SET
        name = COALESCE(${body.data.name as string}, name),
        weekly_cap = COALESCE(${body.data.weeklyCap as number}, weekly_cap),
        monthly_push_target = COALESCE(${body.data.monthlyPushTarget as number}, monthly_push_target),
        assured_bookings = COALESCE(${body.data.assuredBookings as number}, assured_bookings),
        list_price_inr = COALESCE(${body.data.listPriceInr as number | null}, list_price_inr),
        plan_summary = COALESCE(${body.data.planSummary as string | null}, plan_summary),
        active = COALESCE(${body.data.active as boolean}, active),
        sort_order = COALESCE(${body.data.sortOrder as number}, sort_order),
        updated_at = NOW()
      WHERE id = ${body.data.id as string}::uuid
    `;

    try {
      const { syncPlansPricingRagDoc } = await import("@/lib/plans-rag-doc");
      await syncPlansPricingRagDoc();
    } catch (err) {
      console.error("[admin/config] plans RAG sync failed", err);
    }
  }

  if (body.group === "planReorder" && Array.isArray(body.data.order)) {
    const order = body.data.order as string[];
    for (let i = 0; i < order.length; i++) {
      await sql`
        UPDATE plan_tiers SET sort_order = ${i + 1}, updated_at = NOW()
        WHERE id = ${order[i]}::uuid
      `;
    }
  }

  if (body.group === "ceremonies" && Array.isArray(body.data.ceremonyTypes)) {
    await sql`
      UPDATE sla_config SET ceremony_types = ${sql.json(body.data.ceremonyTypes)}, updated_at = NOW()
      WHERE id = 1
    `;
  }

  if (body.group === "budgetTierRanges" && body.data.ranges) {
    await sql`
      UPDATE sla_config SET
        budget_tier_ranges = ${sql.json(body.data.ranges as Record<string, string>)},
        updated_at = NOW()
      WHERE id = 1
    `;
  }

  if (body.group === "budgetTierLimits" && body.data.limits) {
    const limits = normalizeBudgetTierLimits(body.data.limits);
    const ranges = deriveBudgetTierRangeLabels(limits);
    await sql`
      UPDATE sla_config SET
        budget_tier_limits = ${sql.json(limits)},
        budget_tier_ranges = ${sql.json(ranges)},
        updated_at = NOW()
      WHERE id = 1
    `;
  }

  if (body.group === "leadSources" && Array.isArray(body.data.sources)) {
    await sql`
      UPDATE sla_config SET
        lead_sources = ${sql.json(body.data.sources as string[])},
        updated_at = NOW()
      WHERE id = 1
    `;
  }

  if (body.group === "whatsappConfig") {
    const [current] = await sql<{ whatsappConfig: WhatsAppConfig }[]>`
      SELECT whatsapp_config AS "whatsappConfig" FROM sla_config WHERE id = 1
    `;
    const merged: WhatsAppConfig = {
      ...(current?.whatsappConfig ?? {}),
      ...(body.data as WhatsAppConfig),
      templateBodies: {
        ...(current?.whatsappConfig?.templateBodies ?? {}),
        ...((body.data as WhatsAppConfig).templateBodies ?? {}),
      },
      templateImageUrls: {
        ...(current?.whatsappConfig?.templateImageUrls ?? {}),
        ...((body.data as WhatsAppConfig).templateImageUrls ?? {}),
      },
      salesStageDefaults: {
        ...(current?.whatsappConfig?.salesStageDefaults ?? {}),
        ...((body.data as WhatsAppConfig).salesStageDefaults ?? {}),
      },
      rmPushStageDefaults: {
        ...(current?.whatsappConfig?.rmPushStageDefaults ?? {}),
        ...((body.data as WhatsAppConfig).rmPushStageDefaults ?? {}),
      },
      rmPushBrideDefaults: {
        ...(current?.whatsappConfig?.rmPushBrideDefaults ?? {}),
        ...((body.data as WhatsAppConfig).rmPushBrideDefaults ?? {}),
      },
      savedTemplates:
        (body.data as WhatsAppConfig).savedTemplates ??
        current?.whatsappConfig?.savedTemplates ??
        [],
    };
    await sql`
      UPDATE sla_config SET whatsapp_config = ${sql.json(merged)}, updated_at = NOW()
      WHERE id = 1
    `;
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}

function enrichSla(
  sla: SlaConfig & {
    budgetTierRanges?: unknown;
    budgetTierLimits?: unknown;
    leadSources?: unknown;
  }
): SlaConfig {
  const { limits, ranges } = mergeBudgetTierConfig({
    budgetTierLimits: sla.budgetTierLimits as BudgetTierLimitsConfig | undefined,
    budgetTierRanges: sla.budgetTierRanges as Partial<Record<BudgetTier, string>> | undefined,
  });
  const sources =
    Array.isArray(sla.leadSources) && sla.leadSources.length
      ? (sla.leadSources as string[])
      : DEFAULT_LEAD_SOURCES;
  return {
    ...sla,
    budgetTierLimits: limits,
    budgetTierRanges: ranges,
    leadSources: sources,
  };
}
