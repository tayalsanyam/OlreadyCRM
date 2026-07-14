import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  pipelineAssigneeFilter,
  resolveSalesTeamContext,
} from "@/lib/sales-report-scope";
import type { BudgetTier, LeadStatus, UrgencyBand } from "@/lib/types";

function fromDbTier(t: string): BudgetTier {
  if (t.startsWith("tier_")) return `tier${t.slice(5)}` as BudgetTier;
  return t as BudgetTier;
}

function fromDbStatus(s: string): LeadStatus {
  if (s === "commission_rm") return "commissionRm";
  if (s === "pending_verification") return "pendingVerification";
  return s as LeadStatus;
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? "5")));
  const scope = searchParams.get("scope");

  if (q.length < 2) {
    return NextResponse.json({
      data: { leads: [], muas: [] },
      error: null,
    });
  }

  const { session } = auth;

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.search(q, session),
      error: null,
    });
  }

  const pattern = `%${q}%`;
  const { role, region } = session;

  let leadRows: Array<{
    id: string;
    displayId: string;
    brideName: string;
    phone: string;
    city: string;
    budgetTier: string;
    urgencyBand: string;
    status: string;
  }>;

  if (role === "feedbackRm") {
    leadRows = await sql`
      SELECT bl.id, bl.display_id, bl.bride_name, bl.phone, bl.city, bl.budget_tier, bl.status,
             rm.compute_urgency_band(bl.event_date)::text AS urgency_band
      FROM bride_leads bl
      WHERE (
        bl.bride_name ILIKE ${pattern}
        OR bl.display_id ILIKE ${pattern}
        OR bl.phone ILIKE ${pattern}
      )
      AND bl.status IN ('expired'::lead_status, 'booked'::lead_status)
      AND NOT EXISTS (
        SELECT 1 FROM lead_events le
        WHERE le.lead_id = bl.id
          AND le.status != 'not_needed'
          AND le.event_date >= CURRENT_DATE
      )
      ORDER BY bl.expired_at DESC NULLS LAST, bl.event_date DESC NULLS LAST
      LIMIT ${limit}
    `;
  } else if (role === "commissionRm") {
    if (scope === "queue") {
      leadRows = await sql`
        SELECT bl.id, bl.display_id, bl.bride_name, bl.phone, bl.city, bl.budget_tier, bl.status,
               rm.compute_urgency_band(bl.event_date)::text AS urgency_band
        FROM bride_leads bl
        WHERE (
          bl.bride_name ILIKE ${pattern}
          OR bl.display_id ILIKE ${pattern}
          OR bl.phone ILIKE ${pattern}
        )
        AND (
          (
            bl.status = 'commission_rm'::lead_status
            AND (bl.assigned_rm_id = ${session.userId}::uuid OR bl.assigned_rm_id IS NULL)
          )
          OR EXISTS (
            SELECT 1 FROM mua_pushes mp
            WHERE mp.lead_id = bl.id AND mp.pushed_by = ${session.userId}::uuid
          )
        )
        ORDER BY bl.event_date ASC NULLS LAST, bl.updated_at DESC
        LIMIT ${limit}
      `;
    } else {
      leadRows = await sql`
        SELECT id, display_id, bride_name, phone, city, budget_tier, status,
               rm.compute_urgency_band(event_date)::text AS urgency_band
        FROM bride_leads
        WHERE (
          bride_name ILIKE ${pattern}
          OR display_id ILIKE ${pattern}
          OR phone ILIKE ${pattern}
        )
        AND status = 'commission_rm'::lead_status
        ORDER BY event_date ASC
        LIMIT ${limit}
      `;
    }
  } else if (role === "regionalRm" && region) {
    if (scope === "queue") {
      leadRows = await sql`
        SELECT id, display_id, bride_name, phone, city, budget_tier, status,
               rm.compute_urgency_band(event_date)::text AS urgency_band
        FROM bride_leads
        WHERE (
          bride_name ILIKE ${pattern}
          OR display_id ILIKE ${pattern}
          OR phone ILIKE ${pattern}
        )
        AND assigned_rm_id = ${session.userId}::uuid
        AND status NOT IN ('archived'::lead_status, 'commission_rm'::lead_status)
        ORDER BY event_date ASC NULLS LAST, updated_at DESC
        LIMIT ${limit}
      `;
    } else {
      leadRows = await sql`
        SELECT id, display_id, bride_name, phone, city, budget_tier, status,
               rm.compute_urgency_band(event_date)::text AS urgency_band
        FROM bride_leads
        WHERE (
          bride_name ILIKE ${pattern}
          OR display_id ILIKE ${pattern}
          OR phone ILIKE ${pattern}
        )
        AND status NOT IN ('archived'::lead_status)
        AND region = ${region}::region
        ORDER BY event_date ASC
        LIMIT ${limit}
      `;
    }
  } else {
    leadRows = await sql`
      SELECT id, display_id, bride_name, phone, city, budget_tier, status,
             rm.compute_urgency_band(event_date)::text AS urgency_band
      FROM bride_leads
      WHERE (
        bride_name ILIKE ${pattern}
        OR display_id ILIKE ${pattern}
        OR phone ILIKE ${pattern}
      )
      AND status NOT IN ('archived'::lead_status)
      ORDER BY event_date ASC
      LIMIT ${limit}
    `;
  }

  type MuaSearchRow = {
    id: string;
    displayId: string;
    name: string;
    city: string;
    planTier: string | null;
  };

  let muaRows: MuaSearchRow[];

  if (role === "salesRm" || role === "salesTl") {
    muaRows = await withTransaction(async (tx) => {
      const teamCtx = await resolveSalesTeamContext(tx, session);
      if (!teamCtx) return [];
      const scopeFilter = pipelineAssigneeFilter(tx, teamCtx.memberIds);
      return tx<MuaSearchRow[]>`
        SELECT
          m.id,
          m.display_id AS "displayId",
          m.name,
          m.city,
          m.plan_tier AS "planTier"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        WHERE (m.name ILIKE ${pattern} OR m.display_id ILIKE ${pattern})
          AND p.status = 'active'
          AND p.stage <> 'Rejected'
          AND ${scopeFilter}
        GROUP BY m.id, m.display_id, m.name, m.city, m.plan_tier
        ORDER BY MAX(p.updated_at) DESC
        LIMIT ${limit}
      `;
    });
  } else {
    muaRows = await sql<MuaSearchRow[]>`
      SELECT
        id,
        display_id AS "displayId",
        name,
        city,
        plan_tier AS "planTier"
      FROM muas
      WHERE (name ILIKE ${pattern} OR display_id ILIKE ${pattern})
        AND status = 'active'
      LIMIT ${limit}
    `;
  }

  return NextResponse.json({
    data: {
      leads: leadRows.map((r) => ({
        id: r.id,
        displayId: r.displayId,
        brideName: r.brideName,
        phone: r.phone,
        city: r.city,
        budgetTier: fromDbTier(r.budgetTier),
        urgencyBand: r.urgencyBand as UrgencyBand,
        status: fromDbStatus(r.status),
      })),
      muas: muaRows.map((r) => ({
        id: r.id,
        displayId: r.displayId,
        name: r.name,
        city: r.city,
        planTier: r.planTier,
      })),
    },
    error: null,
  });
}
